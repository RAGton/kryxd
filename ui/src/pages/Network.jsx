import { useCallback, useEffect, useState } from 'react';
import FieldError from '../components/FieldError.jsx';
import { installerApi, getInstallerApiErrorMessage } from '../utils/installerApi.js';

function sanitizeIp(value) {
  return String(value || '').split('/')[0].trim();
}

function netmaskToPrefix(netmask) {
  const parts = netmask.split('.').map(Number);
  let prefix = 0;
  for (const part of parts) {
    let p = part;
    while (p > 0) {
      prefix += p & 1;
      p >>= 1;
    }
  }
  return prefix || 24;
}

function isUsableRemoteIp(value) {
  const ip = sanitizeIp(value);
  if (!ip) return false;
  if (ip === '0.0.0.0') return false;
  if (ip.startsWith('127.')) return false;
  if (ip.startsWith('169.254.')) return false;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

function formatIpv4Input(nextValue, previousValue = '') {
  const raw = String(nextValue || '');
  const previous = String(previousValue || '');
  const isDeleting = raw.length < previous.length;
  const cleaned = raw.replace(/[^\d.]/g, '');

  const parts = cleaned
    .split('.')
    .slice(0, 4)
    .map((part) => part.replace(/\D/g, '').slice(0, 3));

  let formatted = parts
    .filter((part, index) => part !== '' || index < parts.length - 1)
    .join('.');

  if (!isDeleting) {
    const visibleParts = formatted.split('.');
    const lastPart = visibleParts[visibleParts.length - 1] || '';
    const endedWithDot = cleaned.endsWith('.');

    if (endedWithDot && visibleParts.length < 4 && !formatted.endsWith('.')) {
      formatted += '.';
    } else if (!cleaned.includes('.') && lastPart.length === 3 && visibleParts.length < 4) {
      formatted += '.';
    } else if (cleaned.includes('.') && lastPart.length === 3 && visibleParts.length < 4 && !formatted.endsWith('.')) {
      formatted += '.';
    }
  }

  return formatted;
}

function SummaryRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-bold ${highlight ? 'text-accent-blue' : 'text-slate-900 dark:text-slate-200'}`}>{value}</span>
    </div>
  );
}

export default function Network({ wizard, onChange, validation }) {
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
  const [showWifiPassword, setShowWifiPassword] = useState(false);
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
          dns: (wizard.mgmtDns || '1.1.1.1,8.8.8.8').split(',').map(d => d.trim()).filter(Boolean),
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
        const dns = wizard.mgmtDns || '1.1.1.1,8.8.8.8';

        if (!address || !gateway) {
          onChange({ netApplyError: 'Modo estático: informe IP do servidor e gateway antes de aplicar.', netApplyBusy: false });
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
          onChange({ netApplyError: 'O backend não aplicou a configuração de rede (/network/apply).', netApplyBusy: false });
        }
      }
      await refreshStatus();
    } catch (err) {
      if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
        console.warn('[Network] Conexão HTTP caiu. Provavelmente o backend reiniciou a rede com sucesso.');
        onChange({ netApplyBusy: false });
        return;
      }
      onChange({ netApplyError: getInstallerApiErrorMessage(err, 'Falha ao aplicar a configuração de rede.'), netApplyBusy: false });
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
      <section className="flex flex-col min-h-0 overflow-y-auto pr-2 pb-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-text-primary">Topologia de Rede</h2>
          <p className="mt-2 text-base text-slate-500 dark:text-text-secondary font-medium">
            Configure a infraestrutura de rede para o servidor Kryonix.
          </p>
        </div>

        {/* Toggle Mode */}
        <div className="mb-6 inline-flex bg-slate-200/50 dark:bg-bg-surface/50 p-1.5 rounded-xl border border-slate-200/50 dark:border-white/5 shadow-inner">
          <button
            type="button"
            onClick={() => onChange({ mgmtMode: 'dhcp' })}
            disabled={netApplyBusy}
            className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
              isDhcp
                ? 'bg-white dark:bg-bg-elevated text-accent-blue shadow-panel ring-1 ring-slate-200 dark:ring-white/10'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Atribuição Automática (DHCP)
          </button>
          <button
            type="button"
            onClick={() => onChange({ mgmtMode: 'static' })}
            disabled={netApplyBusy}
            className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
              !isDhcp
                ? 'bg-white dark:bg-bg-elevated text-accent-blue shadow-panel ring-1 ring-slate-200 dark:ring-white/10'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Configuração Manual
          </button>
        </div>

        {/* Main Form */}
        <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-6 shadow-sm">
          <div className="grid gap-6">

            {/* Linha 1: Interface & Porta */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="kx-field-label" htmlFor="mgmtInterface">Interface de Rede (LAN/PXE)</label>
                <select
                  id="mgmtInterface"
                  className="kx-select p-3"
                  value={wizard.mgmtInterface}
                  onChange={(event) => onChange({ mgmtInterface: event.target.value, lanIdentified: false })}
                  disabled={netApplyBusy}
                >
                  <option value="">Selecione uma interface</option>
                  {ifaceNames.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <FieldError message={fieldErrors.mgmtInterface} />
              </div>

              <div>
                <label className="kx-field-label" htmlFor="httpPort">Porta HTTP do Painel</label>
                <input
                  id="httpPort"
                  type="number"
                  className="kx-input p-3"
                  value={wizard.httpPort}
                  onChange={(event) => onChange({ httpPort: Number(event.target.value || 0) })}
                  disabled={netApplyBusy}
                />
                <FieldError message={fieldErrors.httpPort} />
              </div>
            </div>

            {/* Configuração DHCP ou Manual */}
            {isDhcp ? (
              <div className="mt-4 bg-accent-blue/5 border border-accent-blue/20 rounded-xl p-5 flex gap-4">
                <div className="text-accent-blue mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-accent-blue mb-1">Configuração Automática Ativada</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    O IP do servidor, máscara de rede, gateway e servidores DNS serão obtidos automaticamente através do servidor DHCP da rede conectada na interface selecionada.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 animate-fade-in">
                {/* Linha 2: IP e Máscara */}
                <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t border-slate-200/50 dark:border-white/5">
                  <div>
                    <label className="kx-field-label" htmlFor="serverIp">Endereço IP do Servidor</label>
                    <input id="serverIp" className="kx-input p-3" value={wizard.serverIp} onChange={handleIpv4Change('serverIp')} inputMode="numeric" disabled={netApplyBusy} placeholder="Ex: 192.168.1.100" />
                    <FieldError message={fieldErrors.serverIp} />
                  </div>
                  <div>
                    <label className="kx-field-label" htmlFor="mgmtNetmask">Máscara de Sub-rede</label>
                    <select id="mgmtNetmask" className="kx-select p-3" value={wizard.mgmtNetmask} onChange={(event) => onChange({ mgmtNetmask: event.target.value })} disabled={netApplyBusy}>
                      <option value="255.255.255.0">255.255.255.0 (/24)</option>
                      <option value="255.255.255.128">255.255.255.128 (/25)</option>
                      <option value="255.255.255.252">255.255.255.252 (/30)</option>
                      <option value="255.255.0.0">255.255.0.0 (/16)</option>
                    </select>
                    <FieldError message={fieldErrors.mgmtNetmask} />
                  </div>
                </div>

                {/* Linha 3: Gateway e DNS 1 */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="kx-field-label" htmlFor="mgmtGateway">Gateway Padrão</label>
                    <input id="mgmtGateway" className="kx-input p-3" value={wizard.mgmtGateway} onChange={handleIpv4Change('mgmtGateway')} inputMode="numeric" disabled={netApplyBusy} placeholder="Ex: 192.168.1.1" />
                    <FieldError message={fieldErrors.mgmtGateway} />
                  </div>
                  <div>
                    <label className="kx-field-label" htmlFor="dns1">Servidor DNS Primário</label>
                    <input id="dns1" className="kx-input p-3" value={dns1} onChange={(e) => setDns(e.target.value, dns2)} disabled={netApplyBusy} placeholder="Ex: 1.1.1.1" />
                  </div>
                </div>

                {/* Linha 4: DNS 2 e Domínio */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="kx-field-label" htmlFor="dns2">Servidor DNS Secundário <span className="normal-case text-xs font-normal ml-1">(Opcional)</span></label>
                    <input id="dns2" className="kx-input p-3" value={dns2} onChange={(e) => setDns(dns1, e.target.value)} disabled={netApplyBusy} placeholder="Ex: 8.8.8.8" />
                  </div>
                  <div>
                    <label className="kx-field-label" htmlFor="mgmtDomain">Search Domain <span className="normal-case text-xs font-normal ml-1">(Opcional)</span></label>
                    <input id="mgmtDomain" className="kx-input p-3" value={wizard.mgmtDomain || ''} onChange={(e) => onChange({ mgmtDomain: e.target.value })} disabled={netApplyBusy} placeholder="Ex: local.kryonix.net" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Application & Validation Errors inline */}
        {error && (
          <div className="mt-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 text-sm text-red-600 dark:text-red-400 flex items-start gap-3">
            <span className="mt-0.5">⚠️</span>
            <div>{error}</div>
          </div>
        )}
        {sameNicSelected && (
          <div className="mt-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 text-sm text-red-600 dark:text-red-400 flex items-start gap-3">
            <span className="mt-0.5">⚠️</span>
            <div>LAN/PXE e WAN não podem usar a mesma placa de rede. Por favor, selecione interfaces distintas.</div>
          </div>
        )}
        {wizard.netApplyError && (
          <div className="mt-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 text-sm text-red-600 dark:text-red-400 flex items-start gap-3">
            <span className="mt-0.5">⚠️</span>
            <div>
              <strong className="block mb-1">Falha ao aplicar a rede</strong>
              {wizard.netApplyError}
            </div>
          </div>
        )}

        {/* Confirmação e Ação Principal */}
        <div className="mt-8 bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <label className="flex items-start gap-3 cursor-pointer flex-1">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-slate-300 text-accent-blue focus:ring-accent-blue transition-colors"
              checked={Boolean(wizard.lanIdentified)}
              onChange={(event) => onChange({ lanIdentified: event.target.checked })}
              disabled={netApplyBusy}
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
              Confirmo que a interface <strong className="text-slate-900 dark:text-white">{wizard.mgmtInterface || '[Não selecionada]'}</strong> corresponde à porta física correta para o serviço LAN/PXE.
            </span>
          </label>
          <button
            type="button"
            className="w-full sm:w-auto btn-primary px-8 py-3 text-sm font-bold shadow-panel flex items-center justify-center gap-2 min-w-[200px]"
            onClick={handleApplyNetwork}
            disabled={!wizard.mgmtInterface || netApplyBusy || !wizard.lanIdentified}
          >
            {netApplyBusy ? (
              <>
                <span className="animate-spin">↻</span> Aplicando...
              </>
            ) : (
              'Aplicar Configuração'
            )}
          </button>
        </div>

      </section>


      {/* ── ÁREA CONTEXTUAL (STATUS/RESUMO - 30%) ─────────────────────── */}
      <aside className="flex flex-col min-h-0 overflow-y-auto pl-2 pb-12 border-l border-slate-200/50 dark:border-white/5">

        {/* Status Live */}
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">Status da Conexão</h3>
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                wizard.netConnected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                wizard.netOffline ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' :
                'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${wizard.netConnected ? 'bg-emerald-500' : wizard.netOffline ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
                {wizard.netConnected ? 'Conectado (Online)' : wizard.netOffline ? 'Modo Offline Ativo' : 'Desconectado'}
              </span>
              <button onClick={loadInterfaces} disabled={loading} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" title="Atualizar">
                <span className={`block w-4 h-4 ${loading ? 'animate-spin' : ''}`}>↻</span>
              </button>
            </div>
            {wizard.netConnected && netStatus?.ssid && (
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-2">
                Rede: <span className="font-bold">{netStatus.ssid}</span>
              </div>
            )}

            {/* Wi-Fi Setup Inline */}
            {hasWifi && !wizard.netConnected && !wizard.netOffline && (
              <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-white/5">
                <p className="text-xs text-slate-500 mb-3">Rede Wi-Fi detectada. Conecte-se para continuar online.</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select className="kx-select flex-1 p-2 text-xs" value={selectedWifiIface} onChange={(e) => setSelectedWifiIface(e.target.value)}>
                      {wifiIfaces.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                    </select>
                    <button type="button" className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors" onClick={scanWifi} disabled={wifiScanning || !selectedWifiIface}>
                      {wifiScanning ? 'Buscando…' : 'Buscar'}
                    </button>
                  </div>

                  {wifiList.length > 0 && (
                    <div className="space-y-2 animate-fade-in">
                      <select className="kx-select w-full p-2 text-xs" value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)}>
                        <option value="">Selecione a rede</option>
                        {wifiList.map((w) => (
                          <option key={w.ssid} value={w.ssid}>{w.ssid} ({w.signal}%)</option>
                        ))}
                      </select>
                      {wifiSsid && (
                        <div className="flex gap-2">
                          <input type="password" placeholder="Senha" className="kx-input flex-1 p-2 text-xs" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} />
                          <button type="button" className="px-3 py-2 bg-accent-blue text-white rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors shadow-sm" onClick={connectWifi} disabled={connecting}>
                            {connecting ? '...' : 'Conectar'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {connectMsg && <div className="text-xs text-accent-blue font-medium mt-2">{connectMsg}</div>}
                </div>
              </div>
            )}

            {/* Continuar Offline */}
            {!wizard.netConnected && (
              <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-white/5">
                <button type="button" onClick={continueOffline} className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${wizard.netOffline ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10'}`}>
                  {wizard.netOffline ? 'Modo Offline Ativo' : 'Continuar sem internet (Offline)'}
                </button>
                {wizard.netOffline && <p className="text-[10px] text-amber-600 dark:text-amber-400/80 mt-2 leading-relaxed">Nenhum pacote será baixado. A instalação usará apenas os recursos nativos presentes na mídia local.</p>}
              </div>
            )}
          </div>
        </div>

        {/* Resumo da Configuração */}
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">Resumo de Configuração</h3>
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col gap-1">
              <SummaryRow label="Total de Interfaces" value={loading ? '...' : String(interfaces.length)} />
              <SummaryRow label="Modo Selecionado" value={isDhcp ? 'DHCP' : 'Manual'} />
              <SummaryRow label="LAN/PXE Escolhida" value={wizard.mgmtInterface || '-'} highlight={!!wizard.mgmtInterface} />
              <SummaryRow label="IP Atribuído" value={isDhcp ? 'Automático' : (wizard.serverIp || '-')} />
              <SummaryRow label="Uplink WAN" value={wanEnabled ? `${wizard.wanInterface}` : 'Desativado'} />
            </div>
          </div>
        </div>

        {/* Advanced Settings (WAN) no modo contextual */}
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">WAN / Internet</h3>
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 flex flex-col gap-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Status</span>
                <span className={`font-bold ${wanEnabled ? 'text-accent-blue' : 'text-slate-500'}`}>{wanEnabled ? 'Ativada' : 'Sem uplink dedicado'}</span>
              </div>
              {wanEnabled && (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Interface</span>
                  <span className="font-bold text-slate-900 dark:text-slate-200">{wizard.wanInterface}</span>
                </div>
              )}
            </div>

            <details className="group border-t border-slate-200/50 dark:border-white/5" onToggle={(e) => setShowWanAdvanced(e.currentTarget.open)} open={showWanAdvanced}>
              <summary className="flex items-center justify-between gap-4 p-4 cursor-pointer list-none select-none hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-black/10">
                Configurar WAN avançado
                <svg className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>

              <div className="p-4 space-y-4 animate-fade-in bg-slate-50/30 dark:bg-black/5">
                <div>
                  <label className="kx-field-label" htmlFor="wanInterface">Interface WAN</label>
                  <select id="wanInterface" className="kx-select p-2.5 text-sm" value={wizard.wanInterface} onChange={(event) => handleWanInterfaceChange(event.target.value)} disabled={netApplyBusy}>
                    <option value="">Nenhuma</option>
                    {ifaceNames
                      .filter((item) => item !== wizard.mgmtInterface)
                      .map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                  </select>
                  <FieldError message={fieldErrors.wanInterface} />
                </div>

                {wanEnabled && (
                  <div className="pt-2">
                    <div className="inline-flex w-full bg-slate-200/50 dark:bg-bg-surface/50 p-1 rounded-lg border border-slate-200/50 dark:border-white/5 mb-4">
                      <button type="button" className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${wizard.wanMode === 'dhcp' ? 'bg-white dark:bg-bg-elevated text-accent-blue shadow-sm ring-1 ring-slate-200 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`} onClick={() => onChange({ wanMode: 'dhcp' })} disabled={netApplyBusy}>DHCP</button>
                      <button type="button" className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${wizard.wanMode === 'static' ? 'bg-white dark:bg-bg-elevated text-accent-blue shadow-sm ring-1 ring-slate-200 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`} onClick={() => onChange({ wanMode: 'static' })} disabled={netApplyBusy}>IP Estático</button>
                      <button type="button" className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${wizard.wanMode === 'pppoe' ? 'bg-white dark:bg-bg-elevated text-accent-blue shadow-sm ring-1 ring-slate-200 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`} onClick={() => onChange({ wanMode: 'pppoe' })} disabled={netApplyBusy}>PPPoE</button>
                    </div>

                    {wizard.wanMode === 'static' && (
                      <div className="grid gap-4 sm:grid-cols-2 animate-fade-in">
                        <div>
                          <label className="kx-field-label" htmlFor="wanAddress">IP WAN</label>
                          <input id="wanAddress" className="kx-input p-2.5 text-sm" value={wizard.wanAddress} onChange={handleIpv4Change('wanAddress')} inputMode="numeric" disabled={netApplyBusy} />
                        </div>
                        <div>
                          <label className="kx-field-label" htmlFor="wanNetmask">Mascara WAN</label>
                          <select id="wanNetmask" className="kx-select p-2.5 text-sm" value={wizard.wanNetmask} onChange={(event) => onChange({ wanNetmask: event.target.value })} disabled={netApplyBusy}>
                            <option value="255.255.255.0">255.255.255.0 (/24)</option>
                            <option value="255.255.255.128">255.255.255.128 (/25)</option>
                          </select>
                        </div>
                        <div>
                          <label className="kx-field-label" htmlFor="wanGateway">Gateway WAN</label>
                          <input id="wanGateway" className="kx-input p-2.5 text-sm" value={wizard.wanGateway} onChange={handleIpv4Change('wanGateway')} inputMode="numeric" disabled={netApplyBusy} />
                        </div>
                        <div>
                          <label className="kx-field-label" htmlFor="wanDns">DNS WAN</label>
                          <input id="wanDns" className="kx-input p-2.5 text-sm" value={wizard.wanDns} onChange={(event) => onChange({ wanDns: event.target.value })} disabled={netApplyBusy} />
                        </div>
                      </div>
                    )}

                    {wizard.wanMode === 'pppoe' && (
                      <div className="grid gap-4 animate-fade-in">
                        <div>
                          <label className="kx-field-label" htmlFor="pppoeUser">Usuário PPPoE</label>
                          <input id="pppoeUser" className="kx-input p-2.5 text-sm" value={wizard.pppoeUser || ''} onChange={(event) => onChange({ pppoeUser: event.target.value })} />
                        </div>
                        <div>
                          <label className="kx-field-label" htmlFor="pppoePassword">Senha PPPoE</label>
                          <div className="flex gap-2">
                            <input id="pppoePassword" type={showPppoePassword ? 'text' : 'password'} className="kx-input flex-1 p-2.5 text-sm" value={wizard.pppoePassword || ''} onChange={(event) => onChange({ pppoePassword: event.target.value })} />
                            <button type="button" className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-xs font-medium" onClick={() => setShowPppoePassword(!showPppoePassword)}>
                              {showPppoePassword ? 'Ocultar' : 'Mostrar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-5">
                      <label className="flex items-start gap-3 bg-slate-100/50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-200/50 dark:border-white/5 cursor-pointer">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-blue focus:ring-accent-blue" checked={Boolean(wizard.wanIdentified)} onChange={(event) => onChange({ wanIdentified: event.target.checked })} disabled={netApplyBusy} />
                        <span className="text-xs text-slate-700 dark:text-slate-300">Confirmei a interface WAN selecionada.</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>

        {/* Checklist e Avisos */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">Requisitos de Avanço</h3>
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${wizard.netConnected || wizard.netOffline ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-500'}`}>✓</span>
                <span className={wizard.netConnected || wizard.netOffline ? 'text-slate-900 dark:text-slate-200 font-medium' : 'text-slate-500'}>Conectividade resolvida</span>
              </li>
              <li className="flex items-center gap-3">
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${wizard.hostName ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-500'}`}>✓</span>
                <span className={wizard.hostName ? 'text-slate-900 dark:text-slate-200 font-medium' : 'text-slate-500'}>Hostname configurado</span>
              </li>
              <li className="flex items-center gap-3">
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${wizard.mgmtInterface ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-500'}`}>✓</span>
                <span className={wizard.mgmtInterface ? 'text-slate-900 dark:text-slate-200 font-medium' : 'text-slate-500'}>Interface LAN selecionada</span>
              </li>
              <li className="flex items-center gap-3">
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${wizard.lanIdentified ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-500'}`}>✓</span>
                <span className={wizard.lanIdentified ? 'text-slate-900 dark:text-slate-200 font-medium' : 'text-slate-500'}>Rede física confirmada</span>
              </li>
            </ul>

            {wizard.networkDhcpPending && (
              <div className="mt-5 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                <strong>Nota:</strong> Configuração DHCP aplicada, aguardando lease na interface. O avanço está liberado.
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-5 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                <strong className="text-xs text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-2">Avisos Relevantes</strong>
                <ul className="text-xs text-amber-700/80 dark:text-amber-400/80 space-y-1 list-disc pl-4">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </aside>

    </div>
  );
}
