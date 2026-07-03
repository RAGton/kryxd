import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { installerApi } from '../utils/installerApi.js';

export default function Source({ wizard, uiState, onChange }) {
  const { t } = useTranslation();
  
  const handlePrepareRepo = async () => {
    onChange({ githubSourceStatus: 'cloning', githubSourceError: null });
    try {
      const res = await installerApi.prepareGithubSource(wizard.sourceRepoUrl, wizard.sourceBranch);
      if (res.status === 'ok' || res.ok) {
        onChange({ 
          githubSourceStatus: 'ready',
          sourceValidated: true,
          sourceClonePath: res.source?.clone_path || res.clone_path,
        });
      } else {
        onChange({ 
          githubSourceStatus: 'error', 
          githubSourceError: res.error || res.message || t('source.timeline.errorUnknown', { defaultValue: 'Erro desconhecido na validação' }),
          sourceValidated: false,
        });
      }
    } catch (err) {
      onChange({ 
        githubSourceStatus: 'error', 
        githubSourceError: err.message || t('source.timeline.errorBackend', { defaultValue: 'Falha ao comunicar com backend' }),
        sourceValidated: false,
      });
    }
  };

  const handleStartDeviceFlow = async () => {
    onChange({ githubAuthStatus: 'starting' });
    try {
      const res = await installerApi.startDeviceFlow();
      if (res.error) {
        onChange({ githubAuthStatus: 'error', sourceError: res.error });
      } else {
        onChange({ 
          githubAuthStatus: 'waiting_for_user',
          githubDeviceCode: res.device_code, // Not returned to UI normally, backend keeps it
          githubUserCode: res.user_code,
          githubVerificationUri: res.verification_uri
        });
        
        // Start polling
        pollDeviceFlow(res.interval || 5);
      }
    } catch (err) {
      onChange({ githubAuthStatus: 'error', sourceError: err.message });
    }
  };

  const pollDeviceFlow = async (intervalSeconds) => {
    try {
      const res = await installerApi.pollDeviceFlow();
      if (res.status === 'authorized' || res.status === 'Authorized') {
        onChange({ 
          githubAuthStatus: 'authorized', 
          githubTokenReady: true 
        });
      } else if (res.status === 'pending' || res.status === 'Pending') {
        setTimeout(() => pollDeviceFlow(intervalSeconds), intervalSeconds * 1000);
      } else if (res.status === 'slow_down' || res.status === 'SlowDown') {
        setTimeout(() => pollDeviceFlow(intervalSeconds + 5), (intervalSeconds + 5) * 1000);
      } else {
        onChange({ githubAuthStatus: 'error', sourceError: res.message || t('source.timeline.authFailed', { defaultValue: 'Auth failed' }) });
      }
    } catch (err) {
      onChange({ githubAuthStatus: 'error', sourceError: err.message });
    }
  };

  const handleCreateRepo = async () => {
    onChange({ githubSourceStatus: 'creating_repo', githubSourceError: null });
    try {
      const res = await installerApi.createFromTemplate(
        wizard.createRepoName,
        wizard.createRepoPrivate,
        'main',
        wizard.templateRepoUrl
      );
      if (res.ok) {
        onChange({
          githubSourceStatus: 'ready',
          sourceValidated: true,
          createdRepoUrl: res.source.repo,
          sourceClonePath: res.source.clonePath,
        });
      } else {
        onChange({ 
          githubSourceStatus: 'error', 
          githubSourceError: res.error || t('source.createRepo.errorCreate', { defaultValue: 'Erro ao criar repositório' }),
          sourceValidated: false,
        });
      }
    } catch (err) {
      onChange({ 
        githubSourceStatus: 'error', 
        githubSourceError: err.message,
        sourceValidated: false,
      });
    }
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full px-4 text-center animate-fade-in-up pb-8 custom-scrollbar overflow-y-auto">
      <div className="mt-4 mb-8 flex flex-col items-center">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
          {t('source.title')}
        </h2>
        <p className="text-base text-slate-500 dark:text-slate-400 max-w-2xl font-medium mx-auto">
          {t('source.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-left">
        {/* Offline Card */}
        <button
          type="button"
          className={`p-6 rounded-2xl border-2 transition-all backdrop-blur-sm ${
            wizard.sourceKind === 'offline-defaults'
              ? 'border-accent-blue bg-accent-blue/10 dark:bg-accent-blue/20 shadow-lg shadow-accent-blue/10'
              : 'border-slate-200 dark:border-white/5 bg-white/5 backdrop-blur-md dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
          }`}
          onClick={() => onChange({ sourceKind: 'offline-defaults' })}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('source.offline.title')}</h3>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {t('source.offline.description')}
          </p>
        </button>

        {/* User Repo Card */}
        <button
          type="button"
          className={`p-6 rounded-2xl border-2 transition-all backdrop-blur-sm ${
            wizard.sourceKind === 'github-user-repo'
              ? 'border-accent-blue bg-accent-blue/10 dark:bg-accent-blue/20 shadow-lg shadow-accent-blue/10'
              : 'border-slate-200 dark:border-white/5 bg-white/5 backdrop-blur-md dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
          }`}
          onClick={() => {
            if (wizard.sourceKind !== 'github-user-repo') {
              onChange({ sourceKind: 'github-user-repo', githubSourceStatus: null, githubSourceError: null });
            }
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('source.userRepo.title')}</h3>
            {wizard.sourceKind === 'github-user-repo' && uiState.githubSourceStatus === 'ready' && (
              <span className="text-xs font-bold uppercase tracking-wider text-green-600 bg-green-500/10 px-2 py-1 rounded">
                {t('source.userRepo.ready')}
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {t('source.userRepo.description')}
          </p>
          
          {wizard.sourceKind === 'github-user-repo' && (
            <div className="mt-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
              <input 
                type="text" 
                placeholder={t('source.userRepo.placeholder')}
                value={wizard.sourceRepoUrl}
                onChange={e => onChange({ sourceRepoUrl: e.target.value, sourceValidated: false, githubSourceStatus: null })}
                className="w-full bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent-blue transition-colors"
                disabled={uiState.githubSourceStatus === 'cloning'}
              />
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder={t('source.userRepo.branch')}
                  value={wizard.sourceBranch}
                  onChange={e => onChange({ sourceBranch: e.target.value, sourceValidated: false, githubSourceStatus: null })}
                  className="w-1/3 bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent-blue transition-colors"
                  disabled={uiState.githubSourceStatus === 'cloning'}
                />
                <button 
                  onClick={handlePrepareRepo}
                  disabled={!wizard.sourceRepoUrl || uiState.githubSourceStatus === 'cloning'}
                  className="w-2/3 bg-accent-blue text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('source.userRepo.prepare')}
                </button>
              </div>
            </div>
          )}
        </button>

        {/* Create Repo Card */}
        <button
          type="button"
          className={`p-6 rounded-2xl border-2 transition-all backdrop-blur-sm ${
            wizard.sourceKind === 'github-create-from-template'
              ? 'border-accent-blue bg-accent-blue/10 dark:bg-accent-blue/20 shadow-lg shadow-accent-blue/10'
              : 'border-slate-200 dark:border-white/5 bg-white/5 backdrop-blur-md dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
          }`}
          onClick={() => {
            if (wizard.sourceKind !== 'github-create-from-template') {
              onChange({ sourceKind: 'github-create-from-template', githubSourceStatus: null, githubSourceError: null });
            }
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('source.createRepo.title')}</h3>
            {wizard.sourceKind === 'github-create-from-template' && uiState.githubSourceStatus === 'ready' && (
              <span className="text-xs font-bold uppercase tracking-wider text-green-600 bg-green-500/10 px-2 py-1 rounded">
                {t('source.userRepo.ready')}
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {t('source.createRepo.description')}
          </p>
          
          {wizard.sourceKind === 'github-create-from-template' && (
            <div className="mt-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
              
              {wizard.githubAuthStatus === 'idle' || !wizard.githubAuthStatus ? (
                <button 
                  onClick={handleStartDeviceFlow}
                  className="w-full bg-white/5 backdrop-blur-md text-white rounded-lg px-4 py-3 text-sm font-bold hover:bg-white/10 backdrop-blur-md transition-colors flex items-center justify-center gap-2"
                >
                  {t('source.createRepo.connectGithub')}
                </button>
              ) : wizard.githubAuthStatus === 'starting' ? (
                <div className="p-4 text-center text-sm text-slate-500">{t('source.timeline.githubAuth')}...</div>
              ) : wizard.githubAuthStatus === 'waiting_for_user' ? (
                <div className="bg-black/5 backdrop-blur-md dark:bg-white/5 backdrop-blur-md p-4 rounded-xl text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{t('source.createRepo.waiting')}</p>
                  <div className="text-3xl font-mono font-bold tracking-widest text-slate-900 dark:text-white mb-4">
                    {wizard.githubUserCode}
                  </div>
                  <a href={wizard.githubVerificationUri} target="_blank" rel="noreferrer" className="inline-block bg-accent-blue text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-accent-blue/90">
                    {t('source.createRepo.openGithub')}
                  </a>
                </div>
              ) : wizard.githubAuthStatus === 'authorized' && uiState.githubSourceStatus !== 'ready' ? (
                <>
                  <input 
                    type="text" 
                    placeholder={t('source.createRepo.repoName')}
                    value={wizard.createRepoName}
                    onChange={e => onChange({ createRepoName: e.target.value, sourceValidated: false, githubSourceStatus: null })}
                    className="w-full bg-white dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent-blue transition-colors"
                    disabled={uiState.githubSourceStatus === 'creating_repo' || uiState.githubSourceStatus === 'cloning'}
                  />
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={wizard.createRepoPrivate}
                        onChange={e => onChange({ createRepoPrivate: e.target.checked })}
                        className="rounded border-slate-300 text-accent-blue focus:ring-accent-blue"
                        disabled={uiState.githubSourceStatus === 'creating_repo'}
                      />
                      {t('source.createRepo.private')}
                    </label>
                  </div>
                  <button 
                    onClick={handleCreateRepo}
                    disabled={!wizard.createRepoName || uiState.githubSourceStatus === 'creating_repo' || uiState.githubSourceStatus === 'cloning'}
                    className="w-full bg-accent-blue text-white rounded-lg px-4 py-3 text-sm font-bold hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
                  >
                    {t('source.createRepo.create')}
                  </button>
                </>
              ) : null}
            </div>
          )}
        </button>

        {/* Template Card */}
        <button
          type="button"
          className={`p-6 rounded-2xl border-2 transition-all backdrop-blur-sm ${
            wizard.sourceKind === 'template'
              ? 'border-slate-500 bg-black/5 backdrop-blur-md0/10 dark:bg-black/5 backdrop-blur-md0/20 shadow-lg'
              : 'border-slate-200 dark:border-white/5 bg-white/5 backdrop-blur-md dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
          }`}
          onClick={() => onChange({ sourceKind: 'template' })}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('source.template.title')}</h3>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {t('source.template.description')}
          </p>
          <div className="text-xs font-mono bg-black/5 backdrop-blur-md dark:bg-white/5 p-2 rounded text-slate-500 border border-slate-200 dark:border-white/5 truncate">
            {wizard.templateRepoUrl}
          </div>
        </button>
      </div>

      {/* GitHub Source Status Panel for User Repo */}
      {wizard.sourceKind === 'github-user-repo' && uiState.githubSourceStatus && (
        <div className="w-full max-w-2xl mx-auto bg-white/10 backdrop-blur-md dark:bg-white/5 border border-slate-200/50 dark:border-white/10 rounded-2xl p-6 shadow-sm text-left mb-8">
          <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-6">
            {t('source.timelineTitle')}
          </h4>
          
          <div className="space-y-4">
            <TimelineItem 
              status="done"
              title={t('source.timeline.validateUrl')}
              desc={t('source.timeline.network')}
            />
            
            <TimelineItem 
              status={uiState.githubSourceStatus === 'cloning' ? 'loading' : (uiState.githubSourceStatus ? 'done' : 'waiting')}
              title={t('source.timeline.clone')}
              desc={uiState.githubSourceStatus === 'cloning' ? t('source.timeline.cloning', { defaultValue: 'Cloning...' }) : t('source.timeline.cloned', { defaultValue: 'Cloned' })}
            />
            
            <TimelineItem 
              status={uiState.githubSourceStatus === 'error' ? 'error' : (uiState.githubSourceStatus === 'ready' ? 'done' : 'waiting')}
              title={t('source.timeline.validateFlake')}
              desc={uiState.githubSourceError || (uiState.githubSourceStatus === 'ready' ? t('source.timeline.ready') : t('source.timeline.waitingValidation', { defaultValue: 'Waiting validation...' }))}
            />
          </div>

          {uiState.githubSourceStatus === 'error' && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10 flex gap-4">
              <button 
                onClick={handlePrepareRepo}
                className="px-4 py-2 bg-accent-blue text-white rounded-lg text-sm font-bold hover:bg-accent-blue/90 transition-colors"
              >
                {t('source.userRepo.retry')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* GitHub Source Status Panel for Create Repo */}
      {wizard.sourceKind === 'github-create-from-template' && (uiState.githubSourceStatus || wizard.githubAuthStatus === 'error') && (
        <div className="w-full max-w-2xl mx-auto bg-white/10 backdrop-blur-md dark:bg-white/5 border border-slate-200/50 dark:border-white/10 rounded-2xl p-6 shadow-sm text-left mb-8">
          <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-6">
            {t('source.timelineTitle')}
          </h4>
          
          <div className="space-y-4">
            <TimelineItem 
              status={wizard.githubAuthStatus === 'error' ? 'error' : 'done'}
              title={t('source.timeline.githubAuth')}
              desc={wizard.sourceError || (wizard.githubAuthStatus === 'authorized' ? t('source.timeline.authorized', { defaultValue: 'Autorizado' }) : '')}
            />
            
            <TimelineItem 
              status={uiState.githubSourceStatus === 'creating_repo' ? 'loading' : (uiState.githubSourceStatus === 'cloning' || uiState.githubSourceStatus === 'ready' || uiState.githubSourceStatus === 'error' && uiState.githubSourceError !== 'Autorizado' ? 'done' : 'waiting')}
              title={t('source.timeline.createRepo')}
              desc={uiState.githubSourceStatus === 'creating_repo' ? t('source.createRepo.creating') : ''}
            />
            
            <TimelineItem 
              status={uiState.githubSourceStatus === 'cloning' ? 'loading' : (uiState.githubSourceStatus === 'ready' || uiState.githubSourceStatus === 'error' && uiState.githubSourceError !== 'Autorizado' ? 'done' : 'waiting')}
              title={t('source.timeline.clone')}
              desc={uiState.githubSourceStatus === 'cloning' ? t('source.timeline.cloning', { defaultValue: 'Cloning...' }) : ''}
            />
            
            <TimelineItem 
              status={uiState.githubSourceStatus === 'error' && wizard.githubAuthStatus !== 'error' ? 'error' : (uiState.githubSourceStatus === 'ready' ? 'done' : 'waiting')}
              title={t('source.timeline.validateFlake')}
              desc={uiState.githubSourceError || (uiState.githubSourceStatus === 'ready' ? t('source.createRepo.ready') : t('source.timeline.waitingValidation', { defaultValue: 'Waiting validation...' }))}
            />
          </div>

          {uiState.githubSourceStatus === 'error' && wizard.githubAuthStatus !== 'error' && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10 flex gap-4">
              <button 
                onClick={handleCreateRepo}
                className="px-4 py-2 bg-accent-blue text-white rounded-lg text-sm font-bold hover:bg-accent-blue/90 transition-colors"
              >
                {t('source.userRepo.retry')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineItem({ status, title, desc }) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1 flex-shrink-0">
        {status === 'done' && (
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
          </div>
        )}
        {status === 'loading' && (
          <div className="w-5 h-5 rounded-full border-2 border-accent-blue border-t-transparent animate-spin"></div>
        )}
        {status === 'error' && (
          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          </div>
        )}
        {status === 'waiting' && (
          <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600"></div>
        )}
      </div>
      <div>
        <h5 className={`text-sm font-bold ${status === 'error' ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
          {title}
        </h5>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
