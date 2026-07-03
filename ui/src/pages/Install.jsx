import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ErrorDiagnosisPanel from '../components/ErrorDiagnosisPanel.jsx';
import AdvancedLogsDrawer from '../components/AdvancedLogsDrawer.jsx';
import { useInstallExecution } from '../hooks/useInstallExecution.js';
import {
  formatRuntimePhaseLabel,
  INSTALL_EXECUTION_PHASES,
  INSTALL_RUNTIME_PHASES,
} from '../utils/installExecution.js';

export default function Install({ draft, uiState, validation, onChange }) {
  const { t } = useTranslation();
  const logRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const [rebootBusy, setRebootBusy] = useState(false);
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [installerToken, setInstallerToken] = useState(() => sessionStorage.getItem('installer_token') || '');

  useEffect(() => {
    if (!installerToken) {
      fetch('/api/token')
        .then(r => r.json())
        .then(data => {
          if (data && data.token) {
            setInstallerToken(data.token);
            sessionStorage.setItem('installer_token', data.token);
          }
        })
        .catch(err => console.warn('Aviso: falha ao auto-obter token CSRF', err));
    }
  }, [installerToken]);

  const {
    executionState,
    planPayload,
    installValidation,
    startInstallation,
    requestReboot,
  } = useInstallExecution({ draft, uiState });

  useEffect(() => {
    if (!logRef.current) return;
    if (!stickToBottomRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [executionState.logTail]);

  const handleLogScroll = (event) => {
    const el = event.currentTarget;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const phase = executionState.phase;
  const runtimePhase = executionState.status.currentPhase;
  const finalExit = executionState.status.exitCode;
  
  const installSucceeded = phase === INSTALL_EXECUTION_PHASES.COMPLETED;
  const installFailed = phase === INSTALL_EXECUTION_PHASES.FAILED;
  const installRunning = phase === INSTALL_EXECUTION_PHASES.RUNNING || phase === INSTALL_EXECUTION_PHASES.VALIDATING;
  const installStarted = executionState.planSubmitted || installRunning || installSucceeded || installFailed;

  useEffect(() => {
    if (uiState.installRunning !== installRunning) {
      onChange({ installRunning });
    }
  }, [installRunning, uiState.installRunning, onChange]);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!installRunning || !executionState.status.startedAt) return;
    
    const startMs = executionState.status.startedAt > 9999999999 
      ? executionState.status.startedAt 
      : executionState.status.startedAt * 1000;
    
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [installRunning, executionState.status.startedAt]);

  const formatTime = (seconds) => {
    if (seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentPhaseIndex = INSTALL_RUNTIME_PHASES.indexOf(runtimePhase);
  const totalPhases = INSTALL_RUNTIME_PHASES.length;
  
  const progressPercent = installSucceeded 
    ? 100 
    : (installRunning && currentPhaseIndex >= 0 ? Math.max(5, Math.floor((currentPhaseIndex / totalPhases) * 100)) : 0);
  
  const estimatedTotalTime = 300; 
  const remaining = installSucceeded ? 0 : Math.max(0, estimatedTotalTime - elapsed);

  const visibleIssues = useMemo(() => {
    const fromInstall = installValidation.blockingIssues.length > 0
      ? installValidation.blockingIssues
      : installValidation.warnings;
    return fromInstall.length > 0 ? fromInstall : (validation?.warnings || []);
  }, [installValidation.blockingIssues, installValidation.warnings, validation?.warnings]);

  const targetSummary = useMemo(() => {
    return [
      ['Hostname', planPayload.network.hostname || '-'],
      ['Timezone', planPayload.locale.timezone || '-'],
      ['Interface', planPayload.network.interface || '-'],
      ['Disco Alvo', planPayload.disk.target || planPayload.disk.sysDisk || '-'],
      ['Usuário', planPayload.admin.user || '-'],
      ['Modo', planPayload.profile.mode || 'Desktop'],
    ];
  }, [planPayload]);

  const finalFailure = executionState.status.lastError
    || executionState.globalError
    || (installFailed ? `Falha na fase ${runtimePhase || 'desconhecida'} com exit code ${finalExit ?? 1}.` : '');

  async function handleReboot() {
    try {
      setRebootBusy(true);
      await requestReboot();
    } finally {
      setRebootBusy(false);
    }
  }

  const handleStartRequest = () => {
    if (installerToken && uiState.destructiveConfirmed && installValidation.blockingIssues.length === 0 && safetyChecked) {
      startInstallation();
    }
  };

  const headerTitle = !installStarted 
    ? t('install.ready', { defaultValue: 'Pronto para Instalar' })
    : installSucceeded 
      ? t('install.completed', { defaultValue: 'Instalação Concluída' })
      : installFailed 
        ? t('install.failed', { defaultValue: 'Falha na Instalação' })
        : t('install.running', { defaultValue: 'Instalação em Andamento' });

  const headerSubtitle = !installStarted 
    ? t('install.wait_confirm', { defaultValue: 'Aguardando confirmação para iniciar as operações.' })
    : installSucceeded
      ? t('install.success_msg', { defaultValue: 'O sistema operacional foi implantado com sucesso.' })
      : installFailed
        ? t('install.fail_msg', { defaultValue: 'A operação foi interrompida devido a um erro.' })
        : `${t('install.current_phase', { defaultValue: 'Fase atual:' })} ${formatRuntimePhaseLabel(runtimePhase)}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {/* HEADER FULL-WIDTH OPERACIONAL */}
      <section className="shrink-0 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 shadow-panel backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-accent-blue">
              Kryonix OS Deployer
            </div>
            <h2 className="mt-1 text-2xl font-black text-white">{headerTitle}</h2>
            <p className="mt-1 text-sm font-medium text-slate-400">{headerSubtitle}</p>
          </div>
          
          {installStarted && (
            <div className="flex gap-8 text-right">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('install.elapsed')}</div>
                <div className="text-xl font-mono font-bold text-white mt-1">{formatTime(elapsed)}</div>
              </div>
              {!installSucceeded && !installFailed && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('install.eta', { defaultValue: 'ETA Estimado' })}</div>
                  <div className="text-xl font-mono font-bold text-slate-300 mt-1">{remaining > 0 ? formatTime(remaining) : '--:--'}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {installStarted && (
          <div className="mt-6">
            <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              <span>{t('install.progress', { defaultValue: 'Progresso Real' })}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/60 shadow-inner">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ease-out ${
                  installFailed ? 'bg-danger' : installSucceeded ? 'bg-success' : 'bg-accent-blue shadow-[0_0_10px_rgba(37,99,235,0.5)]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* GRID PRINCIPAL: 35% ESQUERDA / 65% DIREITA */}
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[0.35fr_0.65fr]">
        
        {/* COLUNA ESQUERDA: Ações e Contexto */}
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          
          {/* Botões de Ação */}
          <div className="flex flex-col gap-3">
            {!installStarted ? (
              <button
                type="button"
                className="btn-primary w-full shadow-lg shadow-accent-blue/20"
                disabled={!uiState.destructiveConfirmed || installValidation.blockingIssues.length > 0 || !installerToken || !safetyChecked}
                onClick={handleStartRequest}
              >
                {t('install.btn_install', { defaultValue: 'Instalar agora' })}
              </button>
            ) : (
              <button
                type="button"
                className={`w-full py-2.5 rounded-xl text-sm font-bold text-center transition-all ${
                  installSucceeded 
                    ? 'bg-success/20 text-success border border-success/30' 
                    : installFailed 
                      ? 'bg-danger/20 text-danger border border-danger/30'
                      : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30 opacity-70 cursor-not-allowed'
                }`}
                disabled={true}
              >
                {installSucceeded 
                  ? t('install.btn_done', { defaultValue: 'Concluído' })
                  : installFailed 
                    ? t('install.btn_fail', { defaultValue: 'Falha Operacional' })
                    : t('install.btn_running', { defaultValue: 'Instalando...' })}
              </button>
            )}

            {(installSucceeded || installFailed) && (
              <button 
                type="button" 
                className="btn-secondary w-full" 
                disabled={rebootBusy} 
                onClick={handleReboot}
              >
                {rebootBusy ? t('install.btn_rebooting', { defaultValue: 'Reiniciando...' }) : t('install.btn_reboot', { defaultValue: 'Reiniciar sistema' })}
              </button>
            )}
            
            {installSucceeded && (
              <p className="text-center text-[11px] font-medium text-slate-400 mt-1">
                {t('install.remove_media', { defaultValue: 'Lembre-se de remover a mídia de instalação antes de reiniciar.' })}
              </p>
            )}
          </div>

          {/* Gate Destrutivo (Segurança da operação) */}
          {!installStarted && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-rose-300">{t('install.security', { defaultValue: 'Segurança da Operação' })}</h3>
              </div>
              <p className="text-xs text-rose-200/80 font-medium leading-relaxed mb-4">
                {t('install.security_desc', { defaultValue: 'O backend recebeu autorização na etapa anterior para executar operações destrutivas no disco. Revise o alvo antes de iniciar.' })}
              </p>
              
              <label className="flex items-start gap-3 p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 cursor-pointer hover:bg-rose-500/20 transition-colors">
                <input 
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 rounded border-rose-500/30 bg-black/50 text-rose-500 focus:ring-rose-500/30"
                  checked={safetyChecked}
                  onChange={(e) => setSafetyChecked(e.target.checked)}
                />
                <span className="text-xs font-semibold text-rose-200">
                  {t('install.confirm_destructive', { defaultValue: 'Confirmo que revisei o disco alvo e autorizo apagar os dados selecionados.' })}
                </span>
              </label>
            </div>
          )}

          {/* Alertas */}
          {visibleIssues.length > 0 && !installStarted && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300 mb-2">{t('install.blocks', { defaultValue: 'Bloqueios Pendentes' })}</div>
              <ul className="list-disc space-y-1 pl-4 text-xs">
                {visibleIssues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          )}

          {/* Resumo do Alvo */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden mt-2">
            <div className="border-b border-white/5 bg-white/5 px-4 py-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('install.target_summary', { defaultValue: 'Resumo do Alvo' })}</h3>
            </div>
            <div className="flex flex-col p-2">
              {targetSummary.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors rounded-lg">
                  <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                  <span className="text-[12px] font-bold text-slate-200">{value}</span>
                </div>
              ))}
            </div>
          </div>
          
        </section>

        {/* COLUNA DIREITA: Terminal e Logs */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-inner">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M4 17h16a2 2 0 002-2V5a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              {t('install.terminal', { defaultValue: 'Terminal de Instalação' })}
            </h3>
            {installStarted && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${installSucceeded ? 'bg-success/20 text-success' : installFailed ? 'bg-danger/20 text-danger' : 'bg-accent-blue/20 text-accent-blue'}`}>
                {installSucceeded ? t('install.term_done', { defaultValue: 'Finalizado' }) : installFailed ? t('install.term_err', { defaultValue: 'Erro Crítico' }) : t('install.term_active', { defaultValue: 'Stream Ativo' })}
              </span>
            )}
          </div>

          {!installStarted ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[url('/img/noise.png')] bg-repeat opacity-80">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-slate-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
              </div>
              <h4 className="text-slate-300 font-bold mb-1">{t('install.wait_start', { defaultValue: 'Aguardando Início' })}</h4>
              <p className="text-[13px] text-slate-500 max-w-sm">
                {t('install.wait_logs', { defaultValue: 'Os logs detalhados e as interações do backend serão exibidos aqui em tempo real assim que a instalação começar.' })}
              </p>
            </div>
          ) : (
            <>
              {executionState.rawError ? (
                <ErrorDiagnosisPanel errorPayload={executionState.rawError} />
              ) : null}

              {installFailed && !executionState.rawError && (
                <div className="bg-danger/10 border-b border-danger/20 p-4 text-sm text-danger-light font-medium">
                  {finalFailure}
                </div>
              )}

              <div className="flex-1 relative min-h-0 bg-[#0A0A0C]">
                <AdvancedLogsDrawer 
                  logs={executionState.logTail} 
                  autoScroll={stickToBottomRef.current} 
                  onScroll={handleLogScroll}
                  className="absolute bottom-0 w-full"
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
