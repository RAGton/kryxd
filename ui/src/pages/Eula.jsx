import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Cpu, 
  HardDrive, 
  Monitor, 
  Activity, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Wifi, 
  WifiOff, 
  Terminal, 
  Server, 
  Check, 
  FileText,
  Radio,
  MemoryStick,
  AlertCircle
} from 'lucide-react';

function HwCard({ icon: Icon, label, value, sub, iconColor = 'text-accent-blue' }) {
  return (
    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/80 dark:border-white/10 rounded-2xl p-3.5 flex flex-col justify-between gap-1 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all hover:border-slate-300 dark:hover:border-white/20">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 ${iconColor}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="mt-1">
        <div className="text-sm font-bold text-slate-900 dark:text-white truncate" title={value ?? '—'}>
          {value ?? '—'}
        </div>
        {sub && (
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ icon: Icon, label, value, ok }) {
  const valueColor = ok === true
    ? 'text-emerald-500 dark:text-emerald-400'
    : ok === false
      ? 'text-rose-500 dark:text-rose-400'
      : 'text-slate-700 dark:text-slate-300';

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0 text-xs">
      <div className="flex items-center gap-2.5">
        <div className="p-1 rounded-md bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-400">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
      </div>
      <span className={`font-bold font-mono ${valueColor}`}>{value ?? '—'}</span>
    </div>
  );
}

export default function Eula({ uiState, onChange, validation }) {
  const { t } = useTranslation();
  const [probe, setProbe]       = useState(null);
  const [scanning, setScanning] = useState(true);
  const [offline, setOffline]   = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/probe')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => {
        if (active) { setProbe(data); setScanning(false); }
      })
      .catch(() => {
        if (active) { setScanning(false); setOffline(true); }
      });
    return () => { active = false; };
  }, []);

  const cpu  = probe?.cpu;
  const disk = Array.isArray(probe?.disks) ? probe.disks[0] : probe?.disks;
  const gpu0 = Array.isArray(probe?.gpu) ? probe.gpu[0] : probe?.gpu;
  const boot = probe?.boot_mode;
  const net  = probe?.network;
  const virt = probe?.virtualization;

  const cpuLabel = cpu?.model
    ? cpu.model.replace(/\(.*\)/g, '').trim().split(' ').slice(-4).join(' ')
    : null;
  const cpuSub = cpu?.cores != null
    ? `${cpu.cores} núcleos${cpu?.threads != null ? ` · ${cpu.threads} threads` : ''}`
    : null;
  const memGb   = probe?.memory_gb ?? probe?.memory?.total_gb;
  const memVal  = memGb != null ? `${memGb} GB` : null;
  const memSub  = probe?.memory?.available_gb != null ? `${probe.memory.available_gb} GB livres` : null;
  const diskVal = disk?.path ?? disk?.name ?? null;
  const diskSub = disk?.size_gb != null ? `${disk.size_gb} GB` : (disk?.size ?? null);
  const gpuVal  = gpu0?.model ?? gpu0?.name ?? (gpu0 ? 'Integrada' : null);
  const gpuSub  = gpu0?.vram_gb != null ? `${gpu0.vram_gb} GB VRAM` : null;

  const terms = [
    {
      num: '01',
      title: t('eula.term1', { defaultValue: 'O sistema KryonixOS será instalado com perfil canônico, substituindo qualquer OS anterior na partição selecionada.' }),
      isDestructive: false
    },
    {
      num: '02',
      title: t('eula.term2', { defaultValue: 'A etapa de armazenamento <strong>pode ser destrutiva</strong>. O particionamento automático apagará a tabela de partições do disco alvo.' }),
      isDestructive: true
    },
    {
      num: '03',
      title: t('eula.term3', { defaultValue: 'Você é responsável por revisar cuidadosamente a seleção de discos, interfaces de rede, região e senhas de administração.' }),
      isDestructive: false
    },
    {
      num: '04',
      title: t('eula.term4', { defaultValue: 'Falhas de fornecimento de energia durante o processo de flash (após o início da escrita de blocos) podem corromper a unidade.' }),
      isDestructive: false
    },
    {
      num: '05',
      title: t('eula.term5', { defaultValue: 'Garanta que possui backup de qualquer dado importante contido no hardware listado na coluna de diagnóstico.' }),
      isDestructive: false
    }
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-6 md:gap-8 h-full">
      {/* ── Coluna esquerda: hardware ── */}
      <div className="flex-1 flex flex-col gap-5 max-w-sm shrink-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('eula.detectedEnv', { defaultValue: 'Ambiente Detectado' })}
            </h2>
          </div>
          {scanning ? (
            <div className="flex items-center gap-2 text-xs font-medium text-accent-blue bg-accent-blue/10 px-2.5 py-1 rounded-full w-fit border border-accent-blue/20">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              {t('eula.verifyingHw', { defaultValue: 'Verificando hardware...' })}
            </div>
          ) : offline ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full w-fit border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('eula.mockMode', { defaultValue: 'MOCK MODE: Dados simulados' })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full w-fit border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('eula.diagnosticDone', { defaultValue: 'Diagnóstico concluído' })}
            </div>
          )}
        </div>

        {/* Diagnostic Cards */}
        <div className="grid grid-cols-2 gap-3">
          <HwCard icon={Cpu} label="CPU" value={cpuLabel} sub={cpuSub} iconColor="text-cyan-500" />
          <HwCard icon={MemoryStick} label="RAM" value={memVal} sub={memSub} iconColor="text-indigo-500" />
          <HwCard icon={HardDrive} label={t('eula.disk', { defaultValue: 'Disco' })} value={diskVal} sub={diskSub} iconColor="text-emerald-500" />
          <HwCard icon={Monitor} label="GPU" value={gpuVal} sub={gpuSub} iconColor="text-amber-500" />
        </div>

        {/* System Attributes */}
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/80 dark:border-white/10 rounded-2xl px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col">
          <StatusRow
            icon={Terminal}
            label="Boot mode"
            value={boot ?? '—'}
            ok={boot === 'UEFI' ? true : boot === 'BIOS' ? null : null}
          />
          <StatusRow
            icon={net?.internet ? Wifi : WifiOff}
            label="Internet"
            value={net?.internet ? t('common.connected', { defaultValue: 'Conectado' }) : net ? t('common.offline', { defaultValue: 'Offline' }) : '—'}
            ok={net?.internet === true ? true : net ? false : null}
          />
          <StatusRow
            icon={Server}
            label={t('eula.virtualization', { defaultValue: 'Virtualização' })}
            value={virt ?? '—'}
            ok={null}
          />
          <StatusRow
            icon={Activity}
            label={t('eula.interface', { defaultValue: 'Interface' })}
            value={net?.interface ?? '—'}
            ok={null}
          />
        </div>
      </div>

      {/* ── Coluna direita: termos + aceite ── */}
      <div className="flex-[1.5] flex flex-col min-w-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/5 relative overflow-hidden animate-fade-in-up">

        <div className="shrink-0 mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-5 h-5 text-accent-blue" />
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t('eula.termsTitle', { defaultValue: 'Termos de Operação' })}
              </h2>
            </div>
            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
              {t('eula.termsSubtitle', { defaultValue: 'Por favor, analise as implicações do processo destrutivo antes de prosseguir.' })}
            </p>
          </div>
        </div>

        {/* Terms list */}
        <div className="flex-1 overflow-y-auto pr-1 pb-4 space-y-3 text-sm text-slate-600 dark:text-slate-300 custom-scrollbar">
          {terms.map((term) => (
            <div
              key={term.num}
              className={`p-3.5 rounded-2xl border transition-all flex gap-3.5 items-start ${
                term.isDestructive
                  ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/25 dark:border-amber-500/20'
                  : 'bg-slate-50/50 dark:bg-white/5 border-slate-200/60 dark:border-white/5'
              }`}
            >
              <span
                className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold shrink-0 mt-0.5 ${
                  term.isDestructive
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-accent-blue/10 text-accent-blue'
                }`}
              >
                {term.num}
              </span>
              <p
                className="text-xs md:text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                dangerouslySetInnerHTML={{ __html: term.title }}
              />
            </div>
          ))}
        </div>

        {/* Acceptance Checkbox */}
        <div className="shrink-0 pt-5 border-t border-slate-200/60 dark:border-white/10 mt-auto">
          <label
            className={`flex items-start gap-3.5 px-5 py-4 rounded-2xl border cursor-pointer transition-all ${
              uiState.eulaAccepted
                ? 'bg-accent-blue/10 dark:bg-accent-blue/15 backdrop-blur-md border-accent-blue/50 dark:border-accent-blue/40 ring-1 ring-accent-blue/20 shadow-sm'
                : 'bg-slate-50/80 dark:bg-white/5 backdrop-blur-md border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <div className="relative flex items-center mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={uiState.eulaAccepted}
                onChange={e => onChange({ eulaAccepted: e.target.checked })}
              />
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  uiState.eulaAccepted
                    ? 'bg-accent-blue border-accent-blue text-white'
                    : 'border-slate-300 dark:border-white/20 bg-white dark:bg-slate-800'
                }`}
              >
                {uiState.eulaAccepted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
            <div className="flex flex-col select-none">
              <span className={`text-sm font-bold ${uiState.eulaAccepted ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                {t('eula.acceptTitle', { defaultValue: 'Compreendo os riscos e aceito os termos' })}
              </span>
              <span className={`text-xs font-medium mt-0.5 ${uiState.eulaAccepted ? 'text-accent-blue dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {t('eula.acceptDesc', { defaultValue: 'Confirmo que verifiquei os dados do ambiente detectado e autorizo a instalação.' })}
              </span>
            </div>
          </label>

          {validation?.blockingIssues?.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validation.blockingIssues[0]}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

