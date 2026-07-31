// ApplyAction — erros de validação inline + checkbox de confirmação física
// + botão "Aplicar Configuração". Apresentação pura.

import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Check, RefreshCw, ShieldCheck } from 'lucide-react';

export default function ApplyAction({
  wizard,
  error,
  sameNicSelected,
  busy,
  onApply,
}) {
  const { t } = useTranslation();

  return (
    <>
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
              onChange={(event) => onChange?.({ lanIdentified: event.target.checked })}
              disabled={busy}
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
          onClick={onApply}
          disabled={!wizard.mgmtInterface || busy || !wizard.lanIdentified}
        >
          {busy ? (
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
    </>
  );
}