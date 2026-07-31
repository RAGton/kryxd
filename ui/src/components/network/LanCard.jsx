// LanCard — Card 1: Interface Principal (LAN / PXE).
// Recebe wizard, onChange, fieldErrors, busy, isDhcp, ifaceNames, dns1, dns2,
// setDns, handleIpv4Change. Sem lógica de domínio — só markup.

import { useTranslation } from 'react-i18next';
import { Server, Info } from 'lucide-react';
import FieldError from '../FieldError.jsx';

export default function LanCard({
  wizard,
  onChange,
  fieldErrors,
  busy,
  isDhcp,
  ifaceNames,
  dns1,
  dns2,
  setDns,
  handleIpv4Change,
}) {
  const { t } = useTranslation();

  return (
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
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
          />
          <FieldError message={fieldErrors.httpPort} />
        </div>
      </div>

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
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
                placeholder="Ex: local.kryonix.net"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}