// WanCard — Card 2: Interface WAN / Internet (opcional).
// Apresentação pura: recebe wizard, onChange, fieldErrors, busy, ifaceNames,
// wanEnabled, handleWanInterfaceChange, handleIpv4Change, showPppoePassword,
// setShowPppoePassword.

import { useTranslation } from 'react-i18next';
import { Globe, Eye, EyeOff } from 'lucide-react';
import FieldError from '../FieldError.jsx';

export default function WanCard({
  wizard,
  onChange,
  fieldErrors,
  busy,
  ifaceNames,
  wanEnabled,
  handleWanInterfaceChange,
  handleIpv4Change,
  showPppoePassword,
  setShowPppoePassword,
}) {
  const { t } = useTranslation();

  return (
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
            disabled={busy}
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
                disabled={busy}
              >
                DHCP
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${wizard.wanMode === 'static' ? 'bg-white dark:bg-slate-800 text-accent-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
                onClick={() => onChange({ wanMode: 'static' })}
                disabled={busy}
              >
                {t('network.static_ip', { defaultValue: 'IP Estático' })}
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${wizard.wanMode === 'pppoe' ? 'bg-white dark:bg-slate-800 text-accent-blue shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
                onClick={() => onChange({ wanMode: 'pppoe' })}
                disabled={busy}
              >
                PPPoE
              </button>
            </div>

            {wizard.wanMode === 'static' && (
              <div className="grid gap-4 sm:grid-cols-2 animate-fade-in">
                <div>
                  <label className="kx-field-label" htmlFor="wanAddress">{t('network.wan_ip', { defaultValue: 'IP WAN' })}</label>
                  <input id="wanAddress" className="kx-input p-2.5 text-sm font-mono" value={wizard.wanAddress} onChange={handleIpv4Change('wanAddress')} inputMode="numeric" disabled={busy} />
                </div>
                <div>
                  <label className="kx-field-label" htmlFor="wanNetmask">{t('network.wan_mask', { defaultValue: 'Máscara WAN' })}</label>
                  <select id="wanNetmask" className="kx-select p-2.5 text-sm font-mono" value={wizard.wanNetmask} onChange={(event) => onChange({ wanNetmask: event.target.value })} disabled={busy}>
                    <option value="255.255.255.0">255.255.255.0 (/24)</option>
                    <option value="255.255.255.128">255.255.255.128 (/25)</option>
                  </select>
                </div>
                <div>
                  <label className="kx-field-label" htmlFor="wanGateway">{t('network.wan_gateway', { defaultValue: 'Gateway WAN' })}</label>
                  <input id="wanGateway" className="kx-input p-2.5 text-sm font-mono" value={wizard.wanGateway} onChange={handleIpv4Change('wanGateway')} inputMode="numeric" disabled={busy} />
                </div>
                <div>
                  <label className="kx-field-label" htmlFor="wanDns">{t('network.wan_dns', { defaultValue: 'DNS WAN' })}</label>
                  <input id="wanDns" className="kx-input p-2.5 text-sm font-mono" value={wizard.wanDns} onChange={(event) => onChange({ wanDns: event.target.value })} disabled={busy} />
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
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-accent-blue focus:ring-accent-blue" checked={Boolean(wizard.wanIdentified)} onChange={(event) => onChange({ wanIdentified: event.target.checked })} disabled={busy} />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('network.confirm_wan', { defaultValue: 'Confirmei a interface WAN selecionada.' })}</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}