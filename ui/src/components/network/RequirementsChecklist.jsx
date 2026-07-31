// RequirementsChecklist — Panel 3 do aside: lista de requisitos para avançar.

import { useTranslation } from 'react-i18next';

export default function RequirementsChecklist({ wizard, warnings }) {
  const { t } = useTranslation();

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-3">
        {t('network.advance_requirements', { defaultValue: 'Requisitos de Avanço' })}
      </span>
      <ul className="space-y-2.5 text-xs">
        <li className="flex items-center gap-2.5">
          <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
            wizard.netConnected || wizard.netOffline ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 text-slate-400 dark:bg-white/10'
          }`}>
            ✓
          </span>
          <span className={wizard.netConnected || wizard.netOffline ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
            {t('network.connectivity_resolved', { defaultValue: 'Conectividade resolvida' })}
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
            wizard.hostName ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 text-slate-400 dark:bg-white/10'
          }`}>
            ✓
          </span>
          <span className={wizard.hostName ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
            {t('network.hostname_configured', { defaultValue: 'Hostname configurado' })}
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
            wizard.mgmtInterface ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 text-slate-400 dark:bg-white/10'
          }`}>
            ✓
          </span>
          <span className={wizard.mgmtInterface ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
            {t('network.lan_interface_selected', { defaultValue: 'Interface LAN selecionada' })}
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
            wizard.lanIdentified ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 text-slate-400 dark:bg-white/10'
          }`}>
            ✓
          </span>
          <span className={wizard.lanIdentified ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
            {t('network.physical_network_confirmed', { defaultValue: 'Rede física confirmada' })}
          </span>
        </li>
      </ul>

      {wizard.networkDhcpPending && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400">
          <strong>{t('network.note', { defaultValue: 'Nota:' })}</strong> {t('network.dhcp_pending', { defaultValue: 'DHCP aplicado. O avanço está liberado.' })}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
          <strong className="text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1">{t('network.relevant_warnings', { defaultValue: 'Avisos' })}</strong>
          <ul className="text-amber-700/80 dark:text-amber-400/80 space-y-1 list-disc pl-4">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}