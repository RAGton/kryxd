import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import WizardInstaller from './WizardInstaller.jsx';
import DashboardLayoutWithTree from './layouts/DashboardLayoutWithTree.jsx';
import ContextLayout from './layouts/ContextLayout.jsx';
import Login from './views/Login';
import DashboardView from './views/Dashboard';
import PveResourceView from './views/PveResourceView';
import DesktopSummary from './pages/kcp/DesktopSummary.jsx';
import BackgroundMosaic from './components/BackgroundMosaic';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Storage from './pages/kcp/Storage.jsx';
import LocalSettings from './pages/kcp/LocalSettings.jsx';
import KcpTerminal from './components/kcp/console/KcpTerminal.jsx';
import TerminalConsole from './components/TerminalConsole.tsx';
import { getCapabilities, getCephOsds, getCephStatus, getSession, getStoragePools, resolveHostCapabilities } from './lib/api.js';

function ContextPlaceholder({ title, description }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-[0_0_30px_rgba(2,6,23,0.32)]">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-400">KVE Context</p>
      <h2 className="mt-2 text-xl font-black text-white">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">{description}</p>
    </div>
  );
}

function DatacenterResourceSummary() {
  return <DashboardView />;
}

function NodeResourceSummary() {
  const { nodeId } = useParams();
  const id = nodeId || 'local-node';
  return <PveResourceView type="node" id={id} label={id} />;
}

function VmResourceSummary() {
  const { vmId } = useParams();
  const id = vmId || 'vm';
  return <PveResourceView type="qemu" id={id} label={id} />;
}

function CtResourceSummary() {
  const { ctId } = useParams();
  const id = ctId || 'ct';
  return <PveResourceView type="lxc" id={id} label={id} />;
}

function RequireSession({ session, children }) {
  if (!session?.authenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function ProtectedRedirect({ session, to }) {
  return (
    <RequireSession session={session}>
      <Navigate to={to} replace />
    </RequireSession>
  );
}

function ProtectedLocalSettings({ session }) {
  return (
    <RequireSession session={session}>
      <div className="min-h-screen bg-[#0a0a0a] p-6 text-slate-100">
        <LocalSettings />
      </div>
    </RequireSession>
  );
}

function ControlCenterHostLayout({ identity, session, children }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [selectedResource, setSelectedResource] = useState({
    id: identity?.uuid || 'local-host',
    type: identity?.role || 'Desktop',
    label: identity?.edition || 'Kryonix Desktop'
  });

  const handleViewChange = (view) => {
    if (view === 'dashboard') {
      navigate('/desktop');
      return;
    }
    if (view === 'terminal') {
      navigate('/desktop/terminal');
      return;
    }
    navigate('/desktop');
  };

  return (
    <RequireSession session={session}>
      <div className="relative flex h-screen w-screen overflow-hidden bg-kve-bg pb-8 text-slate-100 selection:bg-kve-accent/30 selection:text-white">
        <BackgroundMosaic />
        <Sidebar
          currentView="dashboard"
          onViewChange={handleViewChange}
          onResourceSelect={setSelectedResource}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          hideResourceTree
          desktopMode
        />

        <main className="relative z-10 flex min-w-0 flex-1 flex-col">
          <Topbar
            currentView="dashboard"
            selectedResource={selectedResource}
            onResourceSelect={setSelectedResource}
            desktopMode
            session={session}
          />
          <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
          <footer className="glass z-40 flex h-8 shrink-0 items-center justify-end border-t border-kve-border px-8">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
              {identity?.edition || 'Kryonix Desktop'}
            </span>
          </footer>
        </main>
      </div>
    </RequireSession>
  );
}

function formatBytes(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return '0 B';
  const bytes = Number(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function cephHealthClass(health = '') {
  if (health === 'HEALTH_OK') return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200';
  if (health === 'HEALTH_ERR') return 'animate-pulse border-red-400/60 bg-red-500/20 text-red-200';
  return 'border-amber-400/40 bg-amber-500/15 text-amber-200';
}

function BoolBadge({ ok, label }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-bold ${ok ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-red-400/50 bg-red-500/15 text-red-200'}`}>
      {label}
    </span>
  );
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-black text-white">{value}</p>
      {detail && <p className="mt-2 text-sm text-slate-400">{detail}</p>}
    </div>
  );
}

function CephDatacenterStorage() {
  const [status, setStatus] = useState(null);
  const [osds, setOsds] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getCephStatus(), getCephOsds()])
      .then(([cephStatus, cephOsds]) => {
        if (!alive) return;
        setStatus(cephStatus);
        setOsds(Array.isArray(cephOsds) ? cephOsds : []);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <ContextPlaceholder title="Ceph telemetry unavailable" description="Não foi possível consultar o backend de storage distribuído." />;
  }

  if (!status) {
    return <ContextPlaceholder title="Loading Ceph topology" description="Coletando health, quórum, managers e mapa de OSDs." />;
  }

  const downOsds = osds.filter((osd) => !osd.up || !osd.in_cluster).length;
  const usedPercent = status.capacity?.used_percent ?? 0;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-400">Ceph HA Storage Engine</p>
            <h2 className="mt-2 text-2xl font-black text-white">Datacenter Storage Health</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">{status.health_summary}</p>
          </div>
          <span className={`rounded-full border px-4 py-2 font-mono text-sm font-black ${cephHealthClass(status.health)}`}>
            {status.health}
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <MetricCard label="Capacity Used" value={`${usedPercent}%`} detail={`${formatBytes(status.capacity?.used_bytes)} / ${formatBytes(status.capacity?.total_bytes)}`} />
          <MetricCard label="MON Quorum" value={`${status.quorum?.mon_in_quorum}/${status.quorum?.mon_total}`} detail={(status.quorum?.quorum_names || []).join(', ')} />
          <MetricCard label="Placement Groups" value={`${status.placement_groups?.active_clean}/${status.placement_groups?.total}`} detail={`${status.placement_groups?.degraded || 0} degraded · ${status.placement_groups?.stuck || 0} stuck`} />
          <MetricCard label="OSD Exceptions" value={downOsds} detail="DOWN/OUT devices requiring attention" />
        </div>

        <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-900">
          <div className="h-full rounded-full bg-blue-500 shadow-[0_0_24px_rgba(59,130,246,0.45)]" style={{ width: `${usedPercent}%` }} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
          <h3 className="text-lg font-bold text-white">MON Quorum Map</h3>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">MON</th>
                  <th className="px-4 py-3">Node</th>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {(status.quorum?.monitors || []).map((mon, index) => (
                  <tr key={mon.name} className={index % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-950'}>
                    <td className="px-4 py-3 font-mono text-blue-300">{mon.name}</td>
                    <td className="px-4 py-3 text-slate-200">{mon.node}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{mon.rank}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{mon.address}</td>
                    <td className="px-4 py-3"><BoolBadge ok={mon.state === 'quorum'} label={mon.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
          <h3 className="text-lg font-bold text-white">Managers</h3>
          <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-blue-300">Active MGR</p>
            <p className="mt-2 font-mono text-xl font-black text-white">{status.managers?.active_name}</p>
            <p className="text-sm text-slate-400">node: {status.managers?.active_node}</p>
          </div>
          <div className="mt-4 space-y-3">
            {(status.managers?.standbys || []).map((mgr) => (
              <div key={mgr.name} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                <span className="font-mono text-sm text-slate-200">{mgr.name}</span>
                <span className="text-xs text-slate-500">{mgr.node} · {mgr.state}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function NodeDisksPage() {
  const { nodeId } = useParams();
  const [pools, setPools] = useState([]);
  const [osds, setOsds] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getStoragePools().catch(() => []), getCephOsds()])
      .then(([storagePools, cephOsds]) => {
        if (!alive) return;
        setPools(Array.isArray(storagePools) ? storagePools : []);
        setOsds(Array.isArray(cephOsds) ? cephOsds : []);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const localZfsPools = useMemo(() => pools.filter((pool) => (pool.driver || '').toLowerCase() === 'zfs'), [pools]);
  const nodeOsds = useMemo(() => osds.filter((osd) => osd.node === nodeId), [nodeId, osds]);

  if (error) {
    return <ContextPlaceholder title="Node disk telemetry unavailable" description="Não foi possível consultar pools locais e OSDs do cluster." />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-400">Node Storage</p>
        <h2 className="mt-2 text-2xl font-black text-white">{nodeId} Disks</h2>
        <p className="mt-2 text-sm text-slate-400">Local ZFS Pools e Cluster Ceph OSDs fluindo pela seleção da TreeView.</p>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-lg font-bold text-white">Local ZFS Pools</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {localZfsPools.length > 0 ? localZfsPools.map((pool) => (
            <div key={pool.name} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="font-mono text-sm text-blue-300">{pool.name}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">driver</p>
              <p className="text-sm text-slate-200">{pool.driver}</p>
              <p className="mt-3 text-xs text-slate-500">{formatBytes(pool.used_size)} / {formatBytes(pool.total_size)}</p>
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-5 text-sm text-slate-500">Nenhum pool ZFS local retornado pela API.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h3 className="text-lg font-bold text-white">Cluster Ceph OSDs</h3>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">OSD</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">IOPS</th>
                <th className="px-4 py-3">Temp</th>
              </tr>
            </thead>
            <tbody>
              {nodeOsds.map((osd, index) => {
                const used = osd.total_bytes ? Math.round((osd.used_bytes / osd.total_bytes) * 100) : 0;
                return (
                  <tr key={osd.id} className={index % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-950'}>
                    <td className="px-4 py-3 font-mono text-blue-300">osd.{osd.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{osd.device}</td>
                    <td className="px-4 py-3"><BoolBadge ok={osd.up && osd.in_cluster} label={osd.status} /></td>
                    <td className="px-4 py-3 font-mono text-slate-300">{used}%</td>
                    <td className="px-4 py-3 font-mono text-slate-300">R {osd.iops_read} / W {osd.iops_write}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{osd.temperature_c}°C</td>
                  </tr>
                );
              })}
              {nodeOsds.length === 0 && (
                <tr className="bg-slate-900/40">
                  <td colSpan="6" className="px-4 py-6 text-center text-slate-500">Nenhum OSD Ceph atrelado a este node.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(null);
  const [session, setSession] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadBootstrap() {
      try {
        const [identityData, sessionData, capabilityRegistry] = await Promise.all([
          fetch('/api/v1/system/identity')
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
          getSession().catch(() => null),
          getCapabilities().catch(() => null),
        ]);
        if (!alive) return;
        const hostRole = sessionData?.role || identityData?.role;
        const resolvedCapabilities = resolveHostCapabilities(capabilityRegistry, hostRole);
        setIdentity(identityData);
        setSession(sessionData ? { ...sessionData, capabilities: resolvedCapabilities } : sessionData);
        setCapabilities(resolvedCapabilities);
        setError(false);
      } catch {
        if (!alive) return;
        setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadBootstrap();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="w-10 h-10 border-4 border-kryonix-blue border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!identity) {
    return <WizardInstaller />;
  }

  const role = session?.role || identity?.role || 'Core';
  const isCore = role === 'Core' || role === 'ThinkServer';

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session?.authenticated ? <Navigate to="/" replace /> : <Login onLogin={(nextSession) => {
            const resolvedCapabilities = resolveHostCapabilities(nextSession?.capabilities?.registry, nextSession?.role || identity?.role);
            const authenticatedSession = { ...nextSession, capabilities: resolvedCapabilities };
            setSession(authenticatedSession);
            setCapabilities(resolvedCapabilities);
          }} />}
        />

        <Route path="/" element={<ProtectedRedirect session={session} to={isCore ? '/kcp/datacenter/summary' : '/desktop'} />} />
        <Route path="/fleet" element={<ProtectedRedirect session={session} to="/kcp/datacenter/cluster" />} />
        <Route path="/storage" element={<ProtectedRedirect session={session} to="/kcp/datacenter/storage" />} />
        <Route path="/virt" element={<ProtectedRedirect session={session} to="/kcp/datacenter/summary" />} />
        <Route path="/local-settings" element={<ProtectedLocalSettings session={session} />} />
        <Route path="/desktop" element={<ControlCenterHostLayout identity={identity} session={session}><DesktopSummary session={session} /></ControlCenterHostLayout>} />
        <Route path="/desktop/terminal" element={<ControlCenterHostLayout identity={identity} session={session}><TerminalConsole /></ControlCenterHostLayout>} />

        {isCore && (
          <Route
            path="/kcp"
            element={
              <RequireSession session={session}>
                <DashboardLayoutWithTree />
              </RequireSession>
            }
          >
            <Route index element={<Navigate to="datacenter/summary" replace />} />

            <Route path="datacenter" element={<ContextLayout />}>
              <Route index element={<Navigate to="summary" replace />} />
              <Route path="summary" element={<DatacenterResourceSummary />} />
              <Route path="cluster" element={<ContextPlaceholder title="Cluster" description="Membros, quórum, voters, leader e estado distribuído do cluster entram aqui." />} />
              <Route path="storage" element={<CephDatacenterStorage />} />
              <Route path="firewall" element={<ContextPlaceholder title="Firewall" description="Políticas globais de firewall e regras de datacenter entram aqui." />} />
            </Route>

            <Route path="node/:nodeId" element={<ContextLayout />}>
              <Route index element={<Navigate to="summary" replace />} />
              <Route path="summary" element={<NodeResourceSummary />} />
              <Route path="shell" element={<ContextPlaceholder title="Shell" description="Shell administrativo seguro do node entra aqui em fase controlada." />} />
              <Route path="network" element={<ContextPlaceholder title="Network" description="Interfaces, bridges, uplinks, VLANs e estado de rede do node." />} />
              <Route path="disks" element={<NodeDisksPage />} />
            </Route>

            <Route path="node/:nodeId/storage/:poolId" element={<ContextLayout />}>
              <Route index element={<Navigate to="summary" replace />} />
              <Route path="summary" element={<Storage />} />
              <Route path="volumes" element={<ContextPlaceholder title="Volumes" description="Volumes do pool entram aqui em fase posterior." />} />
              <Route path="replication" element={<Storage />} />
            </Route>

            <Route path="node/:nodeId/vm/:vmId" element={<ContextLayout />}>
              <Route index element={<Navigate to="summary" replace />} />
              <Route path="summary" element={<VmResourceSummary />} />
              <Route path="console" element={<KcpTerminal />} />
              <Route path="hardware" element={<ContextPlaceholder title="Hardware" description="CPU, memória, discos e NICs da VM entram aqui." />} />
              <Route path="snapshots" element={<ContextPlaceholder title="Snapshots" description="Linha do tempo de snapshots e ações seguras de restore entram aqui." />} />
            </Route>

            <Route path="node/:nodeId/ct/:ctId" element={<ContextLayout />}>
              <Route index element={<Navigate to="summary" replace />} />
              <Route path="summary" element={<CtResourceSummary />} />
              <Route path="console" element={<KcpTerminal />} />
              <Route path="hardware" element={<ContextPlaceholder title="Hardware" description="Limites de CPU, memória, rootfs e devices do container." />} />
              <Route path="snapshots" element={<ContextPlaceholder title="Snapshots" description="Snapshots e rollback do container entram aqui." />} />
            </Route>

            <Route path="*" element={<Navigate to="datacenter/summary" replace />} />
          </Route>
        )}

        <Route path="*" element={<Navigate to={isCore ? '/' : '/desktop'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
