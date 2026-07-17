import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Box, ChevronDown, ChevronRight, Database, Globe2, Loader2, Monitor, RefreshCw, Server } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getClusterTopology } from '../../lib/api.js';

function Branch({ icon: Icon, label, children, defaultOpen = true, depth = 0, to, meta }) {
  const content = (
    <>
      {defaultOpen ? <ChevronDown size={14} className="text-slate-600" /> : <ChevronRight size={14} className="text-slate-600" />}
      <Icon size={15} className="text-blue-400" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{meta}</span>}
    </>
  );

  return (
    <div>
      {to ? (
        <NavLink
          to={to}
          className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors ${
            isActive ? 'bg-blue-500/10 text-blue-400' : 'text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
        >
          {content}
        </NavLink>
      ) : (
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-300"
          style={{ paddingLeft: `${10 + depth * 14}px` }}
        >
          {content}
        </div>
      )}
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function Leaf({ icon: Icon, label, to, depth = 0, meta }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        isActive
          ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20'
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
      style={{ paddingLeft: `${30 + depth * 14}px` }}
    >
      <Icon size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{meta}</span>}
    </NavLink>
  );
}

function EmptyBranch({ depth, label }) {
  return (
    <div
      className="px-2 py-1.5 text-xs italic text-slate-600"
      style={{ paddingLeft: `${30 + depth * 14}px` }}
    >
      {label}
    </div>
  );
}

function routeForNode(node) {
  return node.route || `/kcp/node/${encodeURIComponent(node.node_name || node.name)}/summary`;
}

function routeForStorage(nodeName, storage) {
  return storage.route || `/kcp/node/${encodeURIComponent(nodeName)}/storage/${encodeURIComponent(storage.pool_name || storage.name)}/summary`;
}

function routeForInstance(nodeName, instance, kind) {
  return instance.route || `/kcp/node/${encodeURIComponent(nodeName)}/${kind}/${encodeURIComponent(instance.instance_name || instance.name)}/summary`;
}

function normalizeNodes(topology) {
  return topology?.datacenter?.nodes || topology?.nodes || [];
}

export default function TreeView() {
  const [topology, setTopology] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshTopology = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClusterTopology();
      setTopology(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar topologia do cluster');
      setTopology(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTopology();
    window.addEventListener('kve:topology-refresh', refreshTopology);
    return () => window.removeEventListener('kve:topology-refresh', refreshTopology);
  }, [refreshTopology]);

  const nodes = normalizeNodes(topology);
  const datacenter = topology?.datacenter || { name: 'Datacenter', route: '/kcp/datacenter/summary' };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-white">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Resource Tree</p>
            <p className="mt-1 text-sm font-semibold text-slate-200">KVE Datacenter</p>
          </div>
          <button
            type="button"
            onClick={refreshTopology}
            className="rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-500 transition hover:border-blue-500/40 hover:text-blue-400"
            title="Recarregar topologia"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm">
        {loading && !topology ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin text-blue-400" />
            Descobrindo Incus…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
              <AlertTriangle size={14} /> Topologia indisponível
            </div>
            <p className="mt-1 text-red-200/80">{error}</p>
          </div>
        ) : (
          <Branch icon={Globe2} label={datacenter.name || 'Datacenter'} to={datacenter.route || '/kcp/datacenter/summary'} depth={0}>
            {nodes.length === 0 ? (
              <EmptyBranch depth={1} label="Nenhum node reportado pelo Incus" />
            ) : (
              nodes.map((node) => {
                const nodeName = node.node_name || node.name;
                const storages = node.storages || [];
                const vms = node.vms || [];
                const cts = node.cts || [];
                return (
                  <Branch
                    key={nodeName}
                    icon={Server}
                    label={nodeName}
                    meta={node.status || 'node'}
                    to={routeForNode(node)}
                    depth={1}
                  >
                    {storages.length === 0 && vms.length === 0 && cts.length === 0 && (
                      <EmptyBranch depth={2} label="Sem storage/VM/CT descobertos" />
                    )}
                    {storages.map((storage) => (
                      <Leaf
                        key={`storage-${nodeName}-${storage.pool_name || storage.name}`}
                        icon={Database}
                        label={storage.pool_name || storage.name}
                        meta={storage.driver || 'pool'}
                        to={routeForStorage(nodeName, storage)}
                        depth={2}
                      />
                    ))}
                    {vms.map((vm) => (
                      <Leaf
                        key={`vm-${nodeName}-${vm.instance_name || vm.name}`}
                        icon={Monitor}
                        label={vm.instance_name || vm.name}
                        meta="VM"
                        to={routeForInstance(nodeName, vm, 'vm')}
                        depth={2}
                      />
                    ))}
                    {cts.map((ct) => (
                      <Leaf
                        key={`ct-${nodeName}-${ct.instance_name || ct.name}`}
                        icon={Box}
                        label={ct.instance_name || ct.name}
                        meta="CT"
                        to={routeForInstance(nodeName, ct, 'ct')}
                        depth={2}
                      />
                    ))}
                  </Branch>
                );
              })
            )}
          </Branch>
        )}
      </nav>
    </aside>
  );
}
