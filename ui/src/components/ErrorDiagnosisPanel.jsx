import { useTranslation } from 'react-i18next';

export default function ErrorDiagnosisPanel({ errorPayload, onDismiss }) {
  const { t } = useTranslation();
  if (!errorPayload) return null;

  const isStructuredError = typeof errorPayload === 'object' && errorPayload.code;
  const message = isStructuredError ? errorPayload.message : String(errorPayload);
  const code = isStructuredError ? errorPayload.code : 'UNKNOWN_ERROR';
  const action = isStructuredError ? errorPayload.action : t('error_diagnosis.consult_logs', { defaultValue: 'Consulte os logs para mais detalhes.' });
  const details = isStructuredError && errorPayload.details ? JSON.stringify(errorPayload.details, null, 2) : '';

  const copyDiagnosis = () => {
    navigator.clipboard.writeText(JSON.stringify(errorPayload, null, 2)).catch(() => {});
  };

  return (
    <div className="bg-bg-glass backdrop-blur-xl border border-danger/50 rounded-2xl shadow-danger overflow-hidden my-4 relative">
      <div className="bg-danger/10 px-6 py-4 border-b border-danger/30 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">{t('error_diagnosis.structured_failure', { defaultValue: 'Falha Estruturada' })} ({code})</h3>
            <p className="text-danger font-medium text-sm mt-0.5">{message}</p>
          </div>
        </div>
        
        {onDismiss && (
          <button 
            onClick={onDismiss}
            className="text-text2 hover:text-white transition-colors p-1"
            title={t('error_diagnosis.close', { defaultValue: 'Fechar' })}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {action && (
          <div className="bg-black/5 backdrop-blur-md rounded-lg p-4 border border-border">
            <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-1">{t('error_diagnosis.recommended_action', { defaultValue: 'Ação Recomendada' })}</h4>
            <p className="text-sm text-text">{action}</p>
          </div>
        )}

        {details && (
          <div className="space-y-2">
             <h4 className="text-xs font-bold uppercase tracking-widest text-text2">{t('error_diagnosis.technical_details', { defaultValue: 'Detalhes Técnicos' })}</h4>
             <div className="relative">
               <pre className="bg-black/50 p-4 rounded-lg border border-border/50 text-xs text-text2 overflow-auto font-mono max-h-48">
                 {details}
               </pre>
               <button 
                 onClick={copyDiagnosis}
                 className="absolute top-2 right-2 bg-bg2/80 hover:bg-bg2 border border-border rounded px-2 py-1 text-xs text-text2 hover:text-white transition-colors"
                 title={t('error_diagnosis.copy_json_payload', { defaultValue: 'Copiar Payload JSON' })}
               >
                 {t('error_diagnosis.copy', { defaultValue: 'Copiar' })}
               </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
