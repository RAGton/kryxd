import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Camera,
  Database,
  GitBranch,
  HardDrive,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { generateReplicationPlan, getReplicationStatus, getStoragePools } from '../../lib/api.js';

const DRIVER_STYLES = {
  zfs: 'bg-blue-500/15 text-blue-200 border-blue-400/40',
  ceph: 'bg-orange-500/15 text-orange-200 border-orange-400/40',
  rbd: 'bg-orange-500/15 text-orange-200 border-orange-400/40',
  btrfs: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40',
  lvm: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
};

function formatBytes(value) {
  if (value === null || value === undefined || value === '' || value === 'none') return 'N/A';

  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return String(value);
  if (bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function driverClass(driver = '') {
  return DRIVER_STYLES[driver.toLowerCase()] || 'bg-slate-500/15 text-slate-200 border-slate-400/30';
}

function healthClass(status = '') {
  const normalized = status.toLowerCase();
  if (['created', 'running', 'online'].includes(normalized)) {
    return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40';
  }
  if (['errored', 'error', 'offline', 'degraded'].includes(normalized)) {
    return 'bg-red-500/15 text-red-200 border-red-400/40';
  }
  return 'bg-yellow-500/15 text-yellow-200 border-yellow-400/40';
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-black/20 border border-white/5 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-sm text-white">{value}</p>
    </div>
  );
}

function PoolCard({ pool }) {
  const driver = pool.driver || 'unknown';
  const status = pool.status || 'Unknown';
  const locations = Array.isArray(pool.locations) ? pool.locations : [];

  return (
    <article className="rounded-2xl border border-white/10 bg-kryonix-dark p-5 shadow-panel hover:border-kryonix-blue/40 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pool</p>
          <h3 className="mt-1 truncate text-lg font-semibold text-white">{pool.name || 'unnamed'}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold uppercase ${driverClass(driver)}`}>
          {driver}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400">Saúde</span>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${healthClass(status)}`}>
          {status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Total" value={formatBytes(pool.total_size)} />
        <Metric label="Usado" value={formatBytes(pool.used_size)} />
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Locations</p>
        <p className="mt-1 text-sm text-slate-200">
          {locations.length > 0 ? locations.join(', ') : 'local'}
        </p>
      </div>
    </article>
  );
}

function EmptyState({ message, detail }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-kryonix-dark p-10 text-center shadow-panel">
      <AlertCircle className="mx-auto text-slate-500" size={44} />
      <p className="mt-4 text-base font-semibold text-white">{message}</p>
      {detail && <p className="mt-2 text-sm text-slate-400">{detail}</p>}
    </div>
  );
}

function ComingSoon({ icon: Icon, title }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-kryonix-dark p-10 text-center shadow-panel">
      <Icon className="mx-auto text-kryonix-blue" size={42} />
      <p className="mt-4 text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">Coming Soon — leitura e ações entram numa próxima fase.</p>
    </div>
  );
}

function ReplicationTab() {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [form, setForm] = useState({
    source_pool: 'pool/data',
    target_host: '',
    frequency: 'daily',
  });
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getReplicationStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatusError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const submitPlan = async (event) => {
    event.preventDefault();
    setGenerating(true);
    setPlanError(null);
    setPlan(null);

    try {
      const result = await generateReplicationPlan(form);
      setPlan(result);
    } catch (err) {
      console.error(err);
      setPlanError('Não foi possível gerar o plano declarativo. Confira os campos e tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <form onSubmit={submitPlan} className="rounded-2xl border border-white/10 bg-kryonix-dark p-6 shadow-panel">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-kryonix-blue/10 p-3 text-kryonix-blue">
            <GitBranch size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">ZFS Replication Planner</h3>
            <p className="mt-1 text-sm text-slate-400">
              Gera um plano NixOS auditável. Nada é aplicado no filesystem nesta etapa.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-300">Source Dataset</span>
            <input
              value={form.source_pool}
              onChange={updateField('source_pool')}
              placeholder="pool/data"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-kryonix-blue"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-300">Target Node IP</span>
            <input
              value={form.target_host}
              onChange={updateField('target_host')}
              placeholder="10.0.0.12"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-kryonix-blue"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-300">Frequency</span>
            <select
              value={form.frequency}
              onChange={updateField('frequency')}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-kryonix-blue"
            >
              <option value="hourly">hourly</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
          </label>
        </div>

        <div className="mt-6 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-100">
          A chave SSH é referenciada apenas como path abstrato:
          <code className="ml-1 rounded bg-black/30 px-2 py-1 text-blue-50">/run/secrets/syncoid_key</code>
        </div>

        {planError && <p className="mt-4 text-sm text-red-300">{planError}</p>}

        <button
          type="submit"
          disabled={generating}
          className="mt-6 w-full rounded-xl bg-kryonix-blue px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generating ? 'Generating Plan...' : 'Generate Plan'}
        </button>
      </form>

      <div className="rounded-2xl border border-white/10 bg-kryonix-dark p-6 shadow-panel">
        <div className="flex items-start gap-3">
          <ShieldCheck className="text-emerald-300" size={22} />
          <div>
            <h3 className="text-lg font-bold text-white">Replication Status</h3>
            <p className="mt-1 text-sm text-slate-400">
              Modo atual: {status?.mode || (statusError ? 'indisponível' : 'carregando...')}
            </p>
          </div>
        </div>

        {!plan ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
            Gere um plano para visualizar o bloco NixOS auditável aqui.
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">Plano gerado: {plan.name}</p>
                <p className="text-xs text-slate-400">{plan.source} → {plan.target}</p>
              </div>
              <button
                type="button"
                onClick={() => setPlan(null)}
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
              >
                Audited / Close
              </button>
            </div>
            <pre className="max-h-[460px] overflow-auto p-4 text-xs leading-6 text-blue-50">
              <code>{plan.nix_config}</code>
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Storage() {
  const [activeTab, setActiveTab] = useState('pools');
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getStoragePools()
      .then((data) => {
        if (cancelled) return;
        setPools(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(err);
        setPools([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const tabs = useMemo(
    () => [
      { id: 'pools', label: 'Pools', icon: Database },
      { id: 'replication', label: 'Replication', icon: GitBranch },
      { id: 'volumes', label: 'Volumes', icon: Archive },
      { id: 'snapshots', label: 'Snapshots', icon: Camera },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6 text-text-primary">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-kryonix-blue/10 p-3 text-kryonix-blue">
            <HardDrive size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Storage Command Center</h2>
            <p className="text-sm text-slate-400">Pools Incus e planos declarativos de disaster recovery para o KCP.</p>
          </div>
        </div>
      </header>

      <nav className="flex w-fit flex-wrap gap-1 rounded-xl border border-white/10 bg-kryonix-dark p-1 shadow-panel">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === id
                ? 'bg-kryonix-blue text-white shadow-sm'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'pools' && (
        <section>
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-kryonix-dark p-8 text-slate-300 shadow-panel">
              Carregando Storage Pools...
            </div>
          ) : pools.length === 0 ? (
            <EmptyState
              message="Nenhum Storage Pool encontrado"
              detail={error ? 'A API não respondeu com pools válidos; tente novamente quando o Incus estiver disponível.' : 'O Incus não retornou pools configurados.'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {pools.map((pool, index) => (
                <PoolCard key={pool.name || index} pool={pool} />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'replication' && <ReplicationTab />}
      {activeTab === 'volumes' && <ComingSoon icon={Layers} title="Volumes" />}
      {activeTab === 'snapshots' && <ComingSoon icon={Camera} title="Snapshots" />}
    </div>
  );
}
