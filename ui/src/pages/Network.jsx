import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { installerApi, getInstallerApiErrorMessage } from '../utils/installerApi.js';
import {
  sanitizeIp,
  netmaskToPrefix,
  formatIpv4Input,
  DEFAULT_DNS_CSV,
} from '../utils/network.js';
import { useNetworkInterfaces } from '../hooks/useNetworkInterfaces.js';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';
import NetworkHeader from '../components/network/NetworkHeader.jsx';
import LanCard from '../components/network/LanCard.jsx';
import WanCard from '../components/network/WanCard.jsx';
import ApplyAction from '../components/network/ApplyAction.jsx';
import ConnectionStatusPanel from '../components/network/ConnectionStatusPanel.jsx';
import ConfigSummaryPanel from '../components/network/ConfigSummaryPanel.jsx';
import RequirementsChecklist from '../components/network/RequirementsChecklist.jsx';

export default function Network({ wizard, onChange, validation }) {
  const { t } = useTranslation();
  const [showWanAdvanced, setShowWanAdvanced] = useState(false);

  // Wi-Fi (estado local de UI — não pertence ao wizardState)
  const [wifiList, setWifiList] = useState([]);
  const [wifiScanning, setWifiScanning] = useState(false);
  const [selectedWifiIface, setSelectedWifiIface] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showPppoePassword, setShowPppoePassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectMsg, setConnectMsg] = useState('');

  // Hooks de domínio (I/O + estado local)
  const {
    interfaces,
    wifiIfaces,
    ethIfaces,
    ifaceNames,
    loading,
    error,
    refreshInterfaces,
  } = useNetworkInterfaces();

  const {
    netStatus,
    checkConnectionStatus,
  } = useNetworkStatus();

  const fieldErrors = validation?.fieldErrors || {};
  const warnings = validation?.warnings || [];

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

  // Set O(1) para verificar se um iface Wi-Fi existe na lista atual.
  // Substitui `wifiIfaces.some(...)` O(N) que rodava em todo re-render.
  const wifiNameSet = useMemo(
    () => new Set(wifiIfaces.map((i) => i.name)),
    [wifiIfaces]
  );

  // Refs estáveis para `onChange` e funções: permitem que o useEffect de
  // bootstrap rode uma única vez (deps `[]`) sem disparar re-renders em
  // cascata quando o pai recria os handlers.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // refreshStatusRef.current é uma função estável que:
  //  - chama checkConnectionStatus (do hook)
  //  - aplica o patch no wizardState via onChangeRef.current
  // Isso permite que outros useCallbacks (ex: connectWifi) e o bootstrap
  // chamem `refreshStatusRef.current?.()` sem criar dependência circular.
  const refreshStatusRef = useRef(null);
  refreshStatusRef.current = async () => {
    await checkConnectionStatus((patch) => onChangeRef.current(patch));
  };

  // Bootstrap: roda exatamente uma vez no mount. Faz o fetch de interfaces
  // e (em seguida) o check de status. Sem deps → sem re-execuções.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshInterfaces();
      if (cancelled) return;

      // Auto-selecionar primeira Wi-Fi (preservado do original).
      const wifi = list.find((i) => i.type === 'wifi');
      if (wifi && !selectedWifiIface) {
        setSelectedWifiIface(wifi.name);
      }

      // Patch wizardState: mgmtInterface default + netIfacesCount.
      const names = list.map((i) => i.name).filter(Boolean);
      const patch = { netIfacesCount: names.length };
      if (!wizard.mgmtInterface || !names.includes(wizard.mgmtInterface)) {
        patch.mgmtInterface = names[0] || '';
      }
      onChangeRef.current(patch);

      if (!cancelled) {
        await refreshStatusRef.current?.();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // O(1): usa `wifiNameSet.has(...)` em vez de `wifiIfaces.some(...)`.
  useEffect(() => {
    if (selectedWifiIface && wifiNameSet.has(selectedWifiIface)) {
      scanWifi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWifiIface, wifiNameSet]);

  const connectWifi = useCallback(async () => {
    if (!selectedWifiIface || !wifiSsid) return;
    setConnecting(true);
    setConnectMsg('');
    try {
      const result = await installerApi.connectWifi(selectedWifiIface, wifiSsid, wifiPassword);
      setConnectMsg(result?.message || 'Conectado.');
      setWifiPassword('');
      await refreshStatusRef.current?.();
    } catch (nextError) {
      setConnectMsg(getInstallerApiErrorMessage(nextError, 'Falha ao conectar.'));
    } finally {
      setConnecting(false);
    }
  }, [selectedWifiIface, wifiSsid, wifiPassword]);

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
      await refreshStatusRef.current?.();
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

        <NetworkHeader isDhcp={isDhcp} onChange={onChange} busy={netApplyBusy} />

        <LanCard
          wizard={wizard}
          onChange={onChange}
          fieldErrors={fieldErrors}
          busy={netApplyBusy}
          isDhcp={isDhcp}
          ifaceNames={ifaceNames}
          dns1={dns1}
          dns2={dns2}
          setDns={setDns}
          handleIpv4Change={handleIpv4Change}
        />

        <WanCard
          wizard={wizard}
          onChange={onChange}
          fieldErrors={fieldErrors}
          busy={netApplyBusy}
          ifaceNames={ifaceNames}
          wanEnabled={wanEnabled}
          handleWanInterfaceChange={handleWanInterfaceChange}
          handleIpv4Change={handleIpv4Change}
          showPppoePassword={showPppoePassword}
          setShowPppoePassword={setShowPppoePassword}
        />

        <ApplyAction
          wizard={wizard}
          error={error}
          sameNicSelected={sameNicSelected}
          busy={netApplyBusy}
          onApply={handleApplyNetwork}
        />

      </section>

      {/* ── ÁREA CONTEXTUAL (DIAGNÓSTICO E RESUMO - 30%) ─────────────────────── */}
      <aside className="flex flex-col min-h-0 overflow-y-auto pr-1 pb-8 space-y-6 custom-scrollbar border-t lg:border-t-0 lg:border-l border-slate-200/60 dark:border-white/10 lg:pl-6 pt-6 lg:pt-0">

        <ConnectionStatusPanel
          wizard={wizard}
          netStatus={netStatus}
          hasWifi={hasWifi}
          loading={loading}
          onRefresh={refreshInterfaces}
          wifiProps={{
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
            onScan: scanWifi,
            onConnect: connectWifi,
          }}
          onContinueOffline={continueOffline}
        />

        <ConfigSummaryPanel
          loading={loading}
          interfaceCount={interfaces.length}
          isDhcp={isDhcp}
          mgmtInterface={wizard.mgmtInterface}
          serverIp={wizard.serverIp}
          wanEnabled={wanEnabled}
          wanInterface={wizard.wanInterface}
        />

        <RequirementsChecklist wizard={wizard} warnings={warnings} />

      </aside>

    </div>
  );
}
