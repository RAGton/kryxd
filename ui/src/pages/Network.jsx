import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from 'react';
import FieldError from '../components/FieldError.jsx';
import { installerApi, getInstallerApiErrorMessage } from '../utils/installerApi.js';
import {
  Network as NetworkIcon,
  Server,
  Globe,
  Wifi,
  WifiOff,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Info,
  ShieldCheck,
  Terminal,
  Activity,
  ChevronDown,
  Settings
} from 'lucide-react';
import {
  sanitizeIp,
  netmaskToPrefix,
  isUsableRemoteIp,
  formatIpv4Input,
  DEFAULT_DNS_LIST,
  DEFAULT_DNS_CSV,
} from '../utils/network.js';

function SummaryRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0 text-xs">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`font-bold ${highlight ? 'text-accent-blue' : 'text-slate-900 dark:text-slate-200'}`}>{value}</span>
    </div>
  );
}

export default function Network({ wizard, onChange, validation }) {
  const { t } = useTranslation();
  const [interfaces, setInterfaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWanAdvanced, setShowWanAdvanced] = useState(false);

  // Connectivity
  const [netStatus, setNetStatus] = useState(null);
  const [wifiList, setWifiList] = useState([]);
  const [wifiScanning, setWifiScanning] = useState(false);
  const [selectedWifiIface, setSelectedWifiIface] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showPppoePassword, setShowPppoePassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectMsg, setConnectMsg] = useState('');

  const fieldErrors = validation?.fieldErrors || {};
  const warnings = validation?.warnings || [];

  const ifaceNames = interfaces.map((i) => i.name).filter(Boolean);
  const ethIfaces = interfaces.filter((i) => i.type === 'ethernet');
  const wifiIfaces = interfaces.filter((i) => i.type === 'wifi');

  const hasWifi = wifiIfaces.length > 0;
  const wanEnabled = Boolean(wizard.wanInterface);
  const sameNicSelected = wizard.mgmtInterface && wizard.wanInterface && wizard.mgmtInterface === wizard.wanInterface;

  const netApplyBusy = Boolean(wizard.netApplyBusy);

  const dnsParts = (wizard.mgmtDns || '').split(',').map(s => s.trim());
  const dns1 = dnsParts[0] || '';
  const dns2 = dnsParts[1] || '';

  const setDns = (d1, d2) => {
    const arr = [d1, d2].filter(Boolean);
    onChange({ mgmtDns: arr.join(',') });
  };

  const refreshStatus = useCallback(async () => {
    try {
      const status = await installerApi.getNetworkStatus();
      setNetStatus(status);
      if (status.connected) {
        onChange({ netConnected: true, netOffline: false });
        if (status.ip && isUsableRemoteIp(status.ip)) {
          onChange({ serverIp: sanitizeIp(status.ip) });
        }
      } else {
        onChange({ netConnected: false });
      }
    } catch { /* ignora */ }
  }, [onChange]);

  const loadInterfaces = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await installerApi.getNetworkInterfaces();
      const list = Array.isArray(payload?.interfaces) ? payload.interfaces : [];
      setInterfaces(list);

      const wifi = list.find(i => i.type === 'wifi');
      if (wifi && !selectedWifiIface) {
        setSelectedWifiIface(wifi.name);
      }

      const names = list.map((i) => i.name).filter(Boolean);
      const patch = { netIfacesCount: names.length };
      if (!wizard.mgmtInterface || !names.includes(wizard.mgmtInterface)) {
        patch.mgmtInterface = names[0] || '';
      }
      onChange(patch);
    } catch (nextError) {
      setError(getInstallerApiErrorMessage(nextError, 'Falha ao carregar interfaces.'));
    } finally {
      setLoading(false);
    }
  }, [onChange, wizard.mgmtInterface, selectedWifiIface]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadInterfaces();
      if (!cancelled) await refreshStatus();
    })();
    return () => { cancelled = true; };
  }, [loadInterfaces, refreshStatus]);

  const scanWifi = useCallback(async () => {
    if (!selectedWifiIface) return;
    setWifiScanning(true);
    setConnectMsg('');
    try {
      const response = await installerApi.scanWifi(selectedWifiIface);
      setWifiList(Array.isArray(response?.networks) ? response.networks : []);
      if (response?.warning) {
        setConnectMsg(response.warning);
      }
    } catch (nextError) {
      setConnectMsg(getInstallerApiErrorMessage(nextError, 'Falha ao escanear redes Wi-Fi.'));
    } finally {
      setWifiScanning(false);
    }
  }, [selectedWifiIface]);

  // Auto-scan WiFi networks as soon as a WiFi interface is selected.
  // Fix 2026-07-31: user reported "falta busca automática de rede" — the panel
  // should populate the network list without requiring a manual click on "Buscar".
  useEffect(() => {
    if (selectedWifiIface && wifiIfaces.some((i) => i.name === selectedWifiIface)) {
      scanWifi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWifiIface]);

  const connectWifi = useCallback(async () => {
    if (!selectedWifiIface || !wifiSsid) return;
    setConnecting(true);
    setConnectMsg('');
    try {
      const result = await installerApi.connectWifi(selectedWifiIface, wifiSsid, wifiPassword);
      setConnectMsg(result?.message || 'Conectado.');
      setWifiPassword('');
      await refreshStatus();
    } catch (nextError) {
      setConnectMsg(getInstallerApiErrorMessage(nextError, 'Falha ao conectar.'));
    } finally {
      setConnecting(false);
    }
  }, [selectedWifiIface, wifiSsid, wifiPassword, refreshStatus]);

  const continueOffline = () => {
    setWifiSsid('');
    setWifiPassword('');
    onChange({ netOffline: true, netConnected: false });
  };

  const handleApplyNetwork = async () => {
    const mode = wizard.mgmtMode || 'dhcp';
    const iface = wizard.mgmtInterface;

    if (!iface) return;

    onChange({ netApplyError: '', netApplyBusy: true, networkDhcpPending: false });

    let applyResult;
    try {
      if (mode === 'dhcp') {
        applyResult = await installerApi.applyNetwork({
          interface: iface,
          mode: 'dhcp',
          address: '',
          prefix_length: 24,
          gateway: '',
          dns: (wizard.mgmtDns || DEFAULT_DNS_CSV).split(',').map(d => d.trim()).filter(Boolean),
        });

        if (applyResult?.applied && applyResult?.ip && applyResult.ip !== '0.0.0.0') {
          onChange({ serverIp: applyResult.ip, mgmtGateway: applyResult.gateway || '', mgmtDns: applyResult.dns?.join(',') || wizard.mgmtDns, netApplyBusy: false });
        } else {
          onChange({ networkDhcpPending: true, netApplyBusy: false });
        }
      } else {
        const address = wizard.serverIp;
        const prefix = wizard.mgmtNetmask ? netmaskToPrefix(wizard.mgmtNetmask) : 24;
        const gateway = wizard.mgmtGateway;
        const dns = wizard.mgmtDns || DEFAULT_DNS_CSV;

        if (!address || !gateway) {
          onChange({ netApplyError: t('network.static_mode_error', { defaultValue: 'Modo estático: informe IP do servidor e gateway antes de aplicar.' }), netApplyBusy: false });
          return;
        }

        applyResult = await installerApi.applyNetwork({
          interface: iface,
          mode: 'static',
          address,
          prefix_length: prefix,
          gateway,
          dns: dns.split(',').map(d => d.trim()).filter(Boolean),
        });

        if (applyResult?.applied) {
          onChange({ serverIp: applyResult.ip, mgmtGateway: applyResult.gateway || gateway, mgmtDns: applyResult.dns?.join(',') || dns, netApplyBusy: false });
        } else {
          onChange({ netApplyError: t('network.backend_apply_error', { defaultValue: 'O backend não aplicou a configuração de rede (/network/apply).' }), netApplyBusy: false });
        }
      }
      await refreshStatus();
    } catch (err) {
      if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
        console.warn('[Network] Conexão HTTP caiu. Provavelmente o backend reiniciou a rede com sucesso.');
        onChange({ netApplyBusy: false });
        return;
      }
      onChange({ netApplyError: getInstallerApiErrorMessage(err, t('network.fail_apply_config', { defaultValue: 'Falha ao aplicar a configuração de rede.' })), netApplyBusy: false });
    }
  };

  const handleIpv4Change = (field) => (event) => {
    onChange({
      [field]: formatIpv4Input(event.target.value, wizard[field]),
    });
  };

  function handleWanInterfaceChange(nextValue) {
    if (!nextValue) {
      onChange({
        wanInterface: '',
        wanMode: 'dhcp',
        wanAddress: '',
        wanGateway: '',
        wanDns: '',
        pppoeUser: '',
        pppoePassword: '',
        wanIdentified: false,
      });
      return;
    }
    onChange({
      wanInterface: nextValue,
      wanIdentified: false,
    });
  }

  const isDhcp = wizard.mgmtMode === 'dhcp';

  return (
    <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[7fr_3fr] animate-fade-in-up">

      {/* ── ÁREA PRINCIPAL (CONFIGURAÇÃO - 70%) ────────────────────────── */}
      <section className="flex flex-col min-h-0 overflow-y-auto pr-1 pb-8 space-y-6 custom-scrollbar">

        {/* Header & Mode Switcher */}
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
              disabled={netApplyBusy}
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
              disabled={netApplyBusy}
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

        {/* Card 1: Interface LAN / PXE */}
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl md:rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/5">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-200/60 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 text-accent-blue">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('network.lan_card_title', { defaultValue: 'Interface Principal (LAN / PXE)' })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('network.lan_card_desc', { defaultValue: 'Defina a placa de rede responsável pelos serviços do KryonixOS.' })}
                </p>
              </div>
            </div>
            {wizard.mgmtInterface && (
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-accent-blue/10 text-accent-blue px-2.5 py-1 rounded-full border border-accent-blue/20">
                {wizard.mgmtInterface}
              </span>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label className="kx-field-label" htmlFor="hostName">
                {t('network.hostname_label', { defaultValue: 'Nome da Máquina (Hostname)' })}
              </label>
              <input
                id="hostName"
                type="text"
                className="kx-input p-3 text-sm font-mono"
                value={wizard.hostName || ''}
                onChange={(event) => onChange({ hostName: event.target.value })}
                disabled={netApplyBusy}
                placeholder={t('network.hostname_placeholder', { defaultValue: 'ex: kryonix-server' })}
              />
              <FieldError message={fieldErrors.hostName} />
            </div>

            <div>
              <label className="kx-field-label" htmlFor="mgmtInterface">
                {t('network.lan_interface', { defaultValue: 'Interface de Rede (LAN/PXE)' })}
              </label>
              <select
                id="mgmtInterface"
                className="kx-select p-3 text-sm font-mono"
                value={wizard.mgmtInterface}
                onChange={(event) => onChange({ mgmtInterface: event.target.value, lanIdentified: false })}
                disabled={netApplyBusy}
              >
                <option value="">{t('network.select_interface', { defaultValue: 'Selecione uma interface' })}</option>
                {ifaceNames.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <FieldError message={fieldErrors.mgmtInterface} />
            </div>

            <div>
              <label className="kx-field-label" htmlFor="httpPort">
                {t('network.http_port', { defaultValue: 'Porta HTTP do Painel' })}
              </label>
              <input
                id="httpPort"
                type="number"
                className="kx-input p-3 text-sm font-mono"
                value={wizard.httpPort}
                onChange={(event) => onChange({ httpPort: Number(event.target.value || 0) })}
                disabled={netApplyBusy}
              />
              <FieldError message={fieldErrors.httpPort} />
            </div>
          </div>

          {/* Configuração DHCP ou Estática */}
          {isDhcp ? (
            <div className="mt-5 bg-accent-blue/5 border border-accent-blue/20 rounded-2xl p-4 flex gap-3.5 items-start">
              <div className="p-1.5 rounded-lg bg-accent-blue/10 text-accent-blue mt-0.5 shrink-0">
                <Info className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed">
                <h4 className="font-bold text-accent-blue mb-0.5">
                  {t('network.auto_config_enabled', { defaultValue: 'Configuração Automática (DHCP)' })}
                </h4>
                <p className="text-slate-600 dark:text-slate-300">
                  {t('network.dhcp_description', { defaultValue: 'O endereço IP, máscara, gateway e DNS serão obtidos automaticamente do servidor DHCP da rede conectada.' })}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 mt-5 pt-5 border-t border-slate-200/60 dark:border-white/10 animate-fade-in">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="kx-field-label" htmlFor="serverIp">
                    {t('network.server_ip', { defaultValue: 'Endereço IP do Servidor' })}
                  </label>
                  <input
                    id="serverIp"
                    className="kx-input p-3 text-sm font-mono"
                    value={wizard.serverIp}
                    onChange={handleIpv4Change('serverIp')}
                    inputMode="numeric"
                    disabled={netApplyBusy}
                    placeholder="Ex: 192.168.1.100"
                  />
                  <FieldError message={fieldErrors.serverIp} />
                </div>
                <div>
                  <label className="kx-field-label" htmlFor="mgmtNetmask">
                    {t('network.subnet_mask', { defaultValue: 'Máscara de Sub-rede' })}
                  </label>
                  <select
                    id="mgmtNetmask"
                    className="kx-select p-3 text-sm font-mono"
                    value={wizard.mgmtNetmask}
                    onChange={(event) => onChange({ mgmtNetmask: event.target.value })}
                    disabled={netApplyBusy}
                  >
                    <option value="255.255.255.0">255.255.255.0 (/24)</option>
                    <option value="255.255.255.128">255.255.255.128 (/25)</option>
                    <option value="255.255.255.252">255.255.255.252 (/30)</option>
                    <option value="255.255.0.0">255.255.0.0 (/16)</option>
                  </select>
                  <FieldError message={fieldErrors.mgmtNetmask} />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="kx-field-label" htmlFor="mgmtGateway">
                    {t('network.default_gateway', { defaultValue: 'Gateway Padrão' })}
                  </label>
                  <input
                    id="mgmtGateway"
                    className="kx-input p-3 text-sm font-mono"
                    value={wizard.mgmtGateway}
                    onChange={handleIpv4Change('mgmtGateway')}
                    inputMode="numeric"
                    disabled={netApplyBusy}
                    placeholder="Ex: 192.168.1.1"
                  />
                  <FieldError message={fieldErrors.mgmtGateway} />
                </div>
                <div>
                  <label className="kx-field-label" htmlFor="dns1">
                    {t('network.primary_dns', { defaultValue: 'DNS Primário' })}
                  </label>
                  <input
                    id="dns1"
                    className="kx-input p-3 text-sm font-mono"
                    value={dns1}
                    onChange={(e) => setDns(e.target.value, dns2)}
                    disabled={netApplyBusy}
                    placeholder="Ex: 1.1.1.1"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="kx-field-label" htmlFor="dns2">
                    {t('network.secondary_dns', { defaultValue: 'DNS Secundário' })} <span className="normal-case text-[10px] text-slate-400">({t('network.optional', { defaultValue: 'Opcional' })})</span>
                  </label>
                  <input
                    id="dns2"
                    className="kx-input p-3 text-sm font-mono"
                    value={dns2}
                    onChange={(e) => setDns(dns1, e.target.value)}
                    disabled={netApplyBusy}
                    placeholder="Ex: 8.8.8.8"
                  />
                </div>
                <div>
                  <label className="kx-field-label" htmlFor="mgmtDomain">
                    {t('network.search_domain', { defaultValue: 'Search Domain' })} <span className="normal-case text-[10px] text-slate-400">({t('network.optional', { defaultValue: 'Opcional' })})</span>
                  </label>
                  <input
                    id="mgmtDomain"
                    className="kx-input p-3 text-sm font-mono"
                    value={wizard.mgmtDomain || ''}
                    onChange={(e) => onChange({ mgmtDomain: e.target.value })}
                    disabled={netApplyBusy}
                    placeholder="Ex: local.kryonix.net"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Interface WAN / Internet (Opcional) */}
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl md:rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('network.wan_internet', { defaultValue: 'Uplink WAN / Internet' })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('network.wan_subtitle', { defaultValue: 'Configure uma interface dedicada para acesso externo (opcional).' })}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              wanEnabled
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10'
            }`}>
              {wanEnabled ? t('network.wan_active', { defaultValue: 'Uplink Ativo' }) : t('network.not_configured', { defaultValue: 'Não configurado' })}
            </span>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="kx-field-label" htmlFor="wanInterface">
                {t('network.wan_interface', { defaultValue: 'Interface WAN Dedicada' })}
              </label>
              <select
                id="wanInterface"
                className="kx-select p-3 text-sm font-mono"
                value={wizard.wanInterface}
                onChange={(event) => handleWanInterfaceChange(event.target.value)}
                disabled={netApplyBusy}
              >
                <option value="">{t('network.none', { defaultValue: 'Nenhuma (Usar apenas LAN)' })}</option>
                {ifaceNames
                  .filter((item) => item !== wizard.mgmtInterface)
                  .map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
              </select>
              <FieldError message={fieldErrors.wanInterface} />
            </div>

            {wanEnabled && (
              <div className="pt-3 space-y-4 animate-fade-in border-t border-slate-200/60 dark:border-white/10">
                <div className="inline-flex w-full bg-slate-100 dark:bg-slate-950/60 p-1 rounded-xl border border-slate-200/60 dark:border-white/10">
                  <button
                    type="button"
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${wizard.wanMode === 'dhcp' ? 'bg-white dark:bg-slate-800 text-accent-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    onClick={() => onChange({ wanMode: 'dhcp' })}
                    disabled={netApplyBusy}
                  >
                    DHCP
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${wizard.wanMode === 'static' ? 'bg-white dark:bg-slate-800 text-accent-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    onClick={() => onChange({ wanMode: 'static' })}
                    disabled={netApplyBusy}
                  >
                    {t('network.static_ip', { defaultValue: 'IP Estático' })}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${wizard.wanMode === 'pppoe' ? 'bg-white dark:bg-slate-800 text-accent-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    onClick={() => onChange({ wanMode: 'pppoe' })}
                    disabled={netApplyBusy}
                  >
                    PPPoE
                  </button>
                </div>

                {wizard.wanMode === 'static' && (
                  <div className="grid gap-4 sm:grid-cols-2 animate-fade-in">
                    <div>
                      <label className="kx-field-label" htmlFor="wanAddress">{t('network.wan_ip', { defaultValue: 'IP WAN' })}</label>
                      <input id="wanAddress" className="kx-input p-2.5 text-sm font-mono" value={wizard.wanAddress} onChange={handleIpv4Change('wanAddress')} inputMode="numeric" disabled={netApplyBusy} />
                    </div>
                    <div>
                      <label className="kx-field-label" htmlFor="wanNetmask">{t('network.wan_mask', { defaultValue: 'Máscara WAN' })}</label>
                      <select id="wanNetmask" className="kx-select p-2.5 text-sm font-mono" value={wizard.wanNetmask} onChange={(event) => onChange({ wanNetmask: event.target.value })} disabled={netApplyBusy}>
                        <option value="255.255.255.0">255.255.255.0 (/24)</option>
                        <option value="255.255.255.128">255.255.255.128 (/25)</option>
                      </select>
                    </div>
                    <div>
                      <label className="kx-field-label" htmlFor="wanGateway">{t('network.wan_gateway', { defaultValue: 'Gateway WAN' })}</label>
                      <input id="wanGateway" className="kx-input p-2.5 text-sm font-mono" value={wizard.wanGateway} onChange={handleIpv4Change('wanGateway')} inputMode="numeric" disabled={netApplyBusy} />
                    </div>
                    <div>
                      <label className="kx-field-label" htmlFor="wanDns">{t('network.wan_dns', { defaultValue: 'DNS WAN' })}</label>
                      <input id="wanDns" className="kx-input p-2.5 text-sm font-mono" value={wizard.wanDns} onChange={(event) => onChange({ wanDns: event.target.value })} disabled={netApplyBusy} />
                    </div>
                  </div>
                )}

                {wizard.wanMode === 'pppoe' && (
                  <div className="grid gap-4 animate-fade-in sm:grid-cols-2">
                    <div>
                      <label className="kx-field-label" htmlFor="pppoeUser">{t('network.pppoe_user', { defaultValue: 'Usuário PPPoE' })}</label>
                      <input id="pppoeUser" className="kx-input p-2.5 text-sm font-mono" value={wizard.pppoeUser || ''} onChange={(event) => onChange({ pppoeUser: event.target.value })} />
                    </div>
                    <div>
                      <label className="kx-field-label" htmlFor="pppoePassword">{t('network.pppoe_password', { defaultValue: 'Senha PPPoE' })}</label>
                      <div className="relative">
                        <input id="pppoePassword" type={showPppoePassword ? 'text' : 'password'} className="kx-input p-2.5 pr-10 text-sm font-mono" value={wizard.pppoePassword || ''} onChange={(event) => onChange({ pppoePassword: event.target.value })} />
                        <button type="button" className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setShowPppoePassword(!showPppoePassword)}>
                          {showPppoePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-accent-blue focus:ring-accent-blue" checked={Boolean(wizard.wanIdentified)} onChange={(event) => onChange({ wanIdentified: event.target.checked })} disabled={netApplyBusy} />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('network.confirm_wan', { defaultValue: 'Confirmei a interface WAN selecionada.' })}</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Application & Validation Errors inline */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>{error}</div>
          </div>
        )}
        {sameNicSelected && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>{t('network.nic_conflict', { defaultValue: 'LAN/PXE e WAN não podem usar a mesma placa de rede. Por favor, selecione interfaces distintas.' })}</div>
          </div>
        )}
        {wizard.netApplyError && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <strong className="block font-bold mb-0.5">{t('network.apply_failed', { defaultValue: 'Falha ao aplicar a rede' })}</strong>
              {wizard.netApplyError}
            </div>
          </div>
        )}

        {/* Action Card: Confirmation & Apply Button */}
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl md:rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <label className={`flex items-start gap-3.5 flex-1 p-3.5 rounded-2xl border cursor-pointer transition-all ${
            wizard.lanIdentified
              ? 'bg-accent-blue/10 dark:bg-accent-blue/15 border-accent-blue/40 ring-1 ring-accent-blue/20'
              : 'bg-slate-50/80 dark:bg-white/5 border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
          }`}>
            <div className="relative flex items-center mt-0.5 shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={Boolean(wizard.lanIdentified)}
                onChange={(event) => onChange({ lanIdentified: event.target.checked })}
                disabled={netApplyBusy}
              />
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  wizard.lanIdentified
                    ? 'bg-accent-blue border-accent-blue text-white'
                    : 'border-slate-300 dark:border-white/20 bg-white dark:bg-slate-800'
                }`}
              >
                {Boolean(wizard.lanIdentified) && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
            <div className="flex flex-col select-none">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed">
                {t('network.confirm_interface_1', { defaultValue: 'Confirmo que a interface ' })}
                <span className="text-accent-blue font-mono">{wizard.mgmtInterface || t('network.not_selected_brackets', { defaultValue: '[Não selecionada]' })}</span>
                {t('network.confirm_interface_2', { defaultValue: ' é a porta física correta para LAN/PXE.' })}
              </span>
            </div>
          </label>

          <button
            type="button"
            className="w-full sm:w-auto btn-primary px-7 py-3.5 text-xs font-bold shadow-panel flex items-center justify-center gap-2 min-w-[200px] shrink-0"
            onClick={handleApplyNetwork}
            disabled={!wizard.mgmtInterface || netApplyBusy || !wizard.lanIdentified}
          >
            {netApplyBusy ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t('network.applying', { defaultValue: 'Aplicando...' })}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{t('network_page.apply', { defaultValue: 'Aplicar Configuração' })}</span>
              </>
            )}
          </button>
        </div>

      </section>

      {/* ── ÁREA CONTEXTUAL (DIAGNÓSTICO E RESUMO - 30%) ─────────────────────── */}
      <aside className="flex flex-col min-h-0 overflow-y-auto pr-1 pb-8 space-y-6 custom-scrollbar border-t lg:border-t-0 lg:border-l border-slate-200/60 dark:border-white/10 lg:pl-6 pt-6 lg:pt-0">

        {/* Panel 1: Live Connection Status */}
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {t('network.connection_status', { defaultValue: 'Status da Conexão' })}
            </span>
            <button
              onClick={loadInterfaces}
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
          {hasWifi && (
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
                    onClick={scanWifi}
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
                          onClick={connectWifi}
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
          )}

          {/* Continuar Offline */}
          {!wizard.netConnected && (
            <div className="mt-3.5 pt-3.5 border-t border-slate-200/60 dark:border-white/10">
              <button
                type="button"
                onClick={continueOffline}
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

        {/* Panel 2: Config Summary */}
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-3">
            {t('network.config_summary', { defaultValue: 'Resumo de Configuração' })}
          </span>
          <div className="space-y-1">
            <SummaryRow label={t('network.total_interfaces', { defaultValue: 'Total de Interfaces' })} value={loading ? '...' : String(interfaces.length)} />
            <SummaryRow label={t('network.selected_mode', { defaultValue: 'Modo Selecionado' })} value={isDhcp ? 'DHCP' : t('network.manual', { defaultValue: 'Manual' })} />
            <SummaryRow label={t('network.lan_pxe_chosen', { defaultValue: 'LAN/PXE Escolhida' })} value={wizard.mgmtInterface || '-'} highlight={!!wizard.mgmtInterface} />
            <SummaryRow label={t('network.assigned_ip', { defaultValue: 'IP Atribuído' })} value={isDhcp ? t('network.automatic', { defaultValue: 'Automático' }) : (wizard.serverIp || '-')} />
            <SummaryRow label={t('network.uplink_wan', { defaultValue: 'Uplink WAN' })} value={wanEnabled ? `${wizard.wanInterface}` : t('network.disabled', { defaultValue: 'Desativado' })} />
          </div>
        </div>

        {/* Panel 3: Requirements Checklist */}
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

      </aside>

    </div>
  );
}

