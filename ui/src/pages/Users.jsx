import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldError from '../components/FieldError.jsx';

function passwordStrength(password, t) {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9\\s]/.test(password)) score += 1;
  const pct = Math.round((score / 5) * 100);
  const label = pct >= 80 ? t('users.account.strengthStrong') : pct >= 60 ? t('users.account.strengthMedium') : t('users.account.strengthWeak');
  return { pct, label };
}

export default function Users({ wizard, onChange, validation }) {
  const { t } = useTranslation();
  const [showSsh, setShowSsh] = useState(false);
  const strength = useMemo(() => passwordStrength(wizard.adminPassword || '', t), [wizard.adminPassword, t]);
  const sshKeys = useMemo(
    () => String(wizard.adminAuthorizedKeys || '').split('\\n').map((line) => line.trim()).filter(Boolean),
    [wizard.adminAuthorizedKeys],
  );
  const fieldErrors = validation?.fieldErrors || {};

  return (
    <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[1fr_0.9fr]">
      <section className="section-panel min-h-0 overflow-y-auto">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-text" htmlFor="adminUser">{t('users.account.user')}</label>
            <input id="adminUser" className="input-shell" value={wizard.adminUser} onChange={(e) => onChange({ adminUser: e.target.value })} />
            <FieldError message={fieldErrors.adminUser} />
          </div>
          <div>
            <label className="label-text" htmlFor="adminFullName">{t('users.account.fullName')}</label>
            <input id="adminFullName" className="input-shell" value={wizard.adminFullName} onChange={(e) => onChange({ adminFullName: e.target.value })} placeholder={t('users.account.fullNamePlaceholder')} />
            <FieldError message={fieldErrors.adminFullName} />
          </div>
          <div className="sm:col-span-2">
            <label className="label-text" htmlFor="adminEmail">{t('users.account.email')}</label>
            <input id="adminEmail" className="input-shell" value={wizard.adminEmail} onChange={(e) => onChange({ adminEmail: e.target.value })} />
            <FieldError message={fieldErrors.adminEmail} />
          </div>
          <div>
            <label className="label-text" htmlFor="adminPassword">{t('users.account.password')}</label>
            <input id="adminPassword" type="password" className="input-shell" value={wizard.adminPassword} onChange={(e) => onChange({ adminPassword: e.target.value })} />
            <FieldError message={fieldErrors.adminPassword} />
          </div>
          <div>
            <label className="label-text" htmlFor="adminPasswordConfirm">{t('users.account.passwordConfirm')}</label>
            <input id="adminPasswordConfirm" type="password" className="input-shell" value={wizard.adminPasswordConfirm} onChange={(e) => onChange({ adminPasswordConfirm: e.target.value })} />
            <FieldError message={fieldErrors.adminPasswordConfirm} />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-white">{t('users.account.passwordStrength')}</span>
            <span className="text-sm font-bold text-cyan-300">{strength.label}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400" style={{ width: `${strength.pct}%` }} />
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded border-white/20 bg-white/5 backdrop-blur-md text-accent-500"
            checked={Boolean(wizard.allowWeakPassword)}
            onChange={(event) => onChange({ allowWeakPassword: event.target.checked })}
          />
          <div>
            <div className="font-semibold text-white">{t('users.account.allowWeakTitle')}</div>
            <div className="mt-1 text-sm text-amber-100">
              {t('users.account.allowWeakDesc')}
            </div>
          </div>
        </label>
      </section>

      <section className="section-panel flex min-h-0 flex-col overflow-hidden">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">{t('users.ssh.title')}</h3>
          <p className="mt-1 text-sm text-slate-400">{t('users.ssh.desc')}</p>
        </div>

        <div className="flex-1 flex flex-col min-h-0 border border-white/10 rounded-2xl overflow-hidden bg-white/5 backdrop-blur-md transition-all duration-300">
          <button
            type="button"
            className="flex items-center justify-between w-full p-4 hover:bg-white/5 transition-colors"
            onClick={() => setShowSsh(!showSsh)}
          >
            <div className="flex flex-col items-start text-left">
              <span className="font-bold text-sm text-white">{t('users.ssh.summary')}</span>
              <span className="text-xs text-slate-400 mt-0.5">{sshKeys.length} {t('users.ssh.activeKeys')}</span>
            </div>
            <span className={`text-[10px] font-bold tracking-wider px-2 py-1 rounded transition-colors ${showSsh ? 'bg-white/10 text-white' : 'bg-accent-blue/10 text-accent-blue'}`}>
              {showSsh ? t('users.ssh.hideKeys') : t('users.ssh.editKeys')}
            </span>
          </button>
          
          {showSsh ? (
            <div className="flex-1 flex flex-col p-4 pt-2 border-t border-white/5 min-h-0 animate-fade-in">
              <p className="mb-3 text-xs text-slate-400">{t('users.ssh.instructions')}</p>
              <textarea
                className="input-shell flex-1 min-h-[160px] resize-none font-mono text-xs leading-6 custom-scrollbar bg-black/40"
                value={wizard.adminAuthorizedKeys}
                onChange={(e) => onChange({ adminAuthorizedKeys: e.target.value })}
                placeholder="ssh-ed25519 AAAAC3... usuario@host"
              />
            </div>
          ) : sshKeys.length > 0 ? (
            <div className="p-4 pt-2 border-t border-white/5 max-h-[120px] overflow-y-auto text-xs text-slate-400 custom-scrollbar animate-fade-in">
               {sshKeys.map((key, index) => <div key={`${index}-${key.slice(0, 12)}`} className="mb-1 truncate font-mono">{key}</div>)}
            </div>
          ) : (
             <div className="p-4 pt-2 border-t border-white/5 text-xs text-slate-500 italic animate-fade-in">
               {t('users.ssh.empty')}
             </div>
          )}
        </div>
      </section>
    </div>
  );
}
