// WifiInlinePanel — sub-bloco dentro do ConnectionStatusPanel.
// Mostra iface Wi-Fi disponível, scan, lista de redes e formulário de conexão.

import { useTranslation } from 'react-i18next';
import { Wifi } from 'lucide-react';

export default function WifiInlinePanel({
  wifiIfaces,
  selectedWifiIface,
  setSelectedWifiIface,
  wifiScanning,
  wifiList,
  wifiSsid,
  setWifiSsid,
  wifiPassword,
  setWifiPassword,
  connecting,
  connectMsg,
  onScan,
  onConnect,
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-3.5 pt-3.5 border-t border-slate-200/60 dark:border-white/10 space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Wifi className="w-3.5 h-3.5 text-accent-blue" />
        <span>{t('network.wifi_detected', { defaultValue: 'Rede Wi-Fi disponível' })}</span>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            className="kx-select flex-1 p-2 text-xs font-mono"
            value={selectedWifiIface}
            onChange={(e) => setSelectedWifiIface(e.target.value)}
          >
            {wifiIfaces.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
          </select>
          <button
            type="button"
            className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shrink-0"
            onClick={onScan}
            disabled={wifiScanning || !selectedWifiIface}
          >
            {wifiScanning ? '...' : t('network.scan', { defaultValue: 'Buscar' })}
          </button>
        </div>

        {wifiList.length > 0 && (
          <div className="space-y-2 animate-fade-in">
            <select
              className="kx-select w-full p-2 text-xs font-mono"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
            >
              <option value="">{t('network.select_network', { defaultValue: 'Selecione a rede' })}</option>
              {wifiList.map((w) => (
                <option key={w.ssid} value={w.ssid}>{w.ssid} ({w.signal}%)</option>
              ))}
            </select>
            {wifiSsid && (
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={t('network.password', { defaultValue: 'Senha' })}
                  className="kx-input flex-1 p-2 text-xs"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 py-2 bg-accent-blue text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors shadow-sm"
                  onClick={onConnect}
                  disabled={connecting}
                >
                  {connecting ? '...' : t('network.connect', { defaultValue: 'Conectar' })}
                </button>
              </div>
            )}
          </div>
        )}
        {wifiList.length === 0 && !wifiScanning && selectedWifiIface && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
            {t('network.scan_empty', { defaultValue: 'Nenhuma rede encontrada. Clique em "Buscar" para tentar novamente.' })}
          </div>
        )}
        {connectMsg && <div className="text-xs text-accent-blue font-medium mt-1">{connectMsg}</div>}
      </div>
    </div>
  );
}