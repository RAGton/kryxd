// NetworkHeader — header + seletor DHCP/Static.
// Componente de apresentação puro: recebe wizard + onChange + busy + isDhcp + t.

import { useTranslation } from 'react-i18next';
import { Network as NetworkIcon, Radio, Sliders } from 'lucide-react';

export default function NetworkHeader({ isDhcp, onChange, busy }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <div>
        <div className="flex items-center gap-2">
          <NetworkIcon className="w-5 h-5 text-accent-blue" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t('network.title', { defaultValue: 'Configuração de Rede' })}
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('network.subtitle', { defaultValue: 'Configure as interfaces LAN/PXE e os parâmetros de rede do sistema.' })}
        </p>
      </div>

      <div className="inline-flex bg-slate-100 dark:bg-slate-950/60 p-1 rounded-xl border border-slate-200/60 dark:border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => onChange({ mgmtMode: 'dhcp' })}
          disabled={busy}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            isDhcp
              ? 'bg-white dark:bg-slate-800 text-accent-blue shadow-sm border border-slate-200/80 dark:border-white/10'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>{t('network.auto_dhcp', { defaultValue: 'Automático (DHCP)' })}</span>
        </button>
        <button
          type="button"
          onClick={() => onChange({ mgmtMode: 'static' })}
          disabled={busy}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            !isDhcp
              ? 'bg-white dark:bg-slate-800 text-accent-blue shadow-sm border border-slate-200/80 dark:border-white/10'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{t('network.manual_config', { defaultValue: 'Manual (Estático)' })}</span>
        </button>
      </div>
    </div>
  );
}