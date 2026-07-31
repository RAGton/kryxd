// ConnectionStatusPanel — Panel 1 do aside: status de conexão + Wi-Fi inline + offline.
// Apresentação pura. Recebe wizard, netStatus, hasWifi, loading, refresh,
// e callbacks de Wi-Fi + continueOffline.

import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import WifiInlinePanel from './WifiInlinePanel.jsx';

export default function ConnectionStatusPanel({
  wizard,
  netStatus,
  hasWifi,
  loading,
  onRefresh,
  wifiProps,
  onContinueOffline,
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {t('network.connection_status', { defaultValue: 'Status da Conexão' })}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors rounded-lg bg-slate-100 dark:bg-white/5"
          title="Atualizar"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
          wizard.netConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' :
          wizard.netOffline ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' :
          'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400 border border-slate-200 dark:border-white/10'
        }`}>
          <span className={`w-2 h-2 rounded-full ${wizard.netConnected ? 'bg-emerald-500 animate-pulse' : wizard.netOffline ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
          {wizard.netConnected ? t('network.status_connected', { defaultValue: 'Conectado (Online)' }) : wizard.netOffline ? t('network.status_offline_active', { defaultValue: 'Modo Offline Ativo' }) : t('network.status_disconnected', { defaultValue: 'Desconectado' })}
        </span>
      </div>

      {wizard.netConnected && netStatus?.ssid && (
        <div className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-200/60 dark:border-white/10 flex items-center justify-between">
          <span className="text-slate-400">{t('network.wifi_network', { defaultValue: 'Rede Wi-Fi:' })}</span>
          <span className="font-bold text-slate-800 dark:text-white">{netStatus.ssid}</span>
        </div>
      )}

      {/* Wi-Fi Setup Inline — sempre visível quando há iface WiFi.
          Fix 2026-07-31: removida gate `!wizard.netConnected && !wizard.netOffline`
          que escondia o painel mesmo com WiFi disponível. */}
      {hasWifi && <WifiInlinePanel {...wifiProps} />}

      {/* Continuar Offline */}
      {!wizard.netConnected && (
        <div className="mt-3.5 pt-3.5 border-t border-slate-200/60 dark:border-white/10">
          <button
            type="button"
            onClick={onContinueOffline}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
              wizard.netOffline
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10'
            }`}
          >
            {wizard.netOffline ? t('network.offline_active', { defaultValue: 'Modo Offline Ativo' }) : t('network.continue_offline', { defaultValue: 'Continuar sem internet (Offline)' })}
          </button>
          {wizard.netOffline && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400/90 mt-2 leading-relaxed">
              {t('network.offline_warning', { defaultValue: 'A instalação usará apenas os recursos nativos presentes na mídia local.' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}