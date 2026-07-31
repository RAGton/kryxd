// ConfigSummaryPanel — Panel 2 do aside: resumo de configuração atual.

import { useTranslation } from 'react-i18next';

function SummaryRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0 text-xs">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`font-bold ${highlight ? 'text-accent-blue' : 'text-slate-900 dark:text-slate-200'}`}>{value}</span>
    </div>
  );
}

export default function ConfigSummaryPanel({
  loading,
  interfaceCount,
  isDhcp,
  mgmtInterface,
  serverIp,
  wanEnabled,
  wanInterface,
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-3">
        {t('network.config_summary', { defaultValue: 'Resumo de Configuração' })}
      </span>
      <div className="space-y-1">
        <SummaryRow
          label={t('network.total_interfaces', { defaultValue: 'Total de Interfaces' })}
          value={loading ? '...' : String(interfaceCount)}
        />
        <SummaryRow
          label={t('network.selected_mode', { defaultValue: 'Modo Selecionado' })}
          value={isDhcp ? 'DHCP' : t('network.manual', { defaultValue: 'Manual' })}
        />
        <SummaryRow
          label={t('network.lan_pxe_chosen', { defaultValue: 'LAN/PXE Escolhida' })}
          value={mgmtInterface || '-'}
          highlight={!!mgmtInterface}
        />
        <SummaryRow
          label={t('network.assigned_ip', { defaultValue: 'IP Atribuído' })}
          value={isDhcp ? t('network.automatic', { defaultValue: 'Automático' }) : (serverIp || '-')}
        />
        <SummaryRow
          label={t('network.uplink_wan', { defaultValue: 'Uplink WAN' })}
          value={wanEnabled ? `${wanInterface}` : t('network.disabled', { defaultValue: 'Desativado' })}
        />
      </div>
    </div>
  );
}