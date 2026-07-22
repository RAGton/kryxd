import { useEffect, useState } from 'react';
import { Activity, Cpu, HardDrive, Monitor, ShieldCheck } from 'lucide-react';
import KveCard from '../../components/KveCard';
import { getHostMetrics, getSystemIdentity } from '../../lib/api.js';

function formatMb(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const mb = Number(value);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export default function DesktopSummary() {
  const [identity, setIdentity] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    async function loadDesktopSummary() {
      try {
        const [identityData, metricsData] = await Promise.all([
          getSystemIdentity().catch(() => null),
          getHostMetrics().catch(() => null),
        ]);
        if (!alive) return;
        setIdentity(identityData);
        setMetrics(metricsData);
        setError('');
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Falha ao carregar telemetria local.');
      }
    }

    loadDesktopSummary();
    const timer = window.setInterval(loadDesktopSummary, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const memory = metrics?.memory;

  return (
    <div className="space-y-6 min-h-screen pb-20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-kve-accent">Kryonix Desktop</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Resumo local do host</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Painel limpo consumindo somente o Axum do próprio kryxd. Sem mock server NodeJS e sem endpoints legados /api/nodes.
          </p>
        </div>
        <div className="rounded-full border border-kve-border bg-slate-950/70 px-4 py-2 text-xs font-mono uppercase tracking-widest text-slate-400">
          {identity?.hostname || 'host local'} · {identity?.role || 'Desktop'}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KveCard title="Identidade" subtitle="/api/v1/system/identity" icon={<Monitor size={18} />}>
          <div className="space-y-3">
            <p className="text-2xl font-black text-white">{identity?.edition || 'Kryonix Desktop'}</p>
            <p className="font-mono text-xs text-slate-500">role: {identity?.role || 'Desktop'}</p>
            <p className="font-mono text-xs text-slate-500">hostname: {identity?.hostname || '—'}</p>
          </div>
        </KveCard>

        <KveCard title="CPU" subtitle="/api/v2/metrics/host" icon={<Cpu size={18} />}>
          <div className="space-y-3">
            <p className="text-3xl font-black text-white">{metrics?.cpuPercent ?? '—'}%</p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-kve-accent" style={{ width: `${Math.min(metrics?.cpuPercent || 0, 100)}%` }} />
            </div>
          </div>
        </KveCard>

        <KveCard title="Memória" subtitle="procfs via Axum" icon={<Activity size={18} />}>
          <div className="space-y-3">
            <p className="text-3xl font-black text-white">{memory?.usedPercent ?? '—'}%</p>
            <p className="font-mono text-xs text-slate-500">
              {formatMb(memory?.usedMb)} / {formatMb(memory?.totalMb)}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-kve-indigo" style={{ width: `${Math.min(memory?.usedPercent || 0, 100)}%` }} />
            </div>
          </div>
        </KveCard>

        <KveCard title="Estado" subtitle="local session" icon={<ShieldCheck size={18} />}>
          <div className="space-y-3">
            <p className="text-2xl font-black text-emerald-300">PAM Local</p>
            <p className="text-xs leading-5 text-slate-500">
              Autenticação restrita à máquina local quando o backend declara uma identidade fixa.
            </p>
          </div>
        </KveCard>
      </div>

      <KveCard title="Storage" subtitle="V2 API Bind pendente" icon={<HardDrive size={18} />}>
        <p className="text-sm leading-6 text-slate-400">
          TODO: ligar este bloco ao contrato agregado de storage do Axum. Nesta fase ele não chama /api/storage nem qualquer endpoint legado NodeJS.
        </p>
      </KveCard>
    </div>
  );
}
