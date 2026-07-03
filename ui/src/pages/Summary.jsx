import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isStrongPassword, buildInstallPlanPayload } from '../utils/installPlan.js';
import { FEATURE_CATALOG } from '../data/featureCatalog.js';
import { getProfileById } from '../data/profileCatalog.js';
import { shouldRecommendSrvData, explainSrvDataReason } from '../utils/storagePlanner.js';

export default function Summary({ wizard, uiState, onChange, validation }) {
  const { t } = useTranslation();

  const SOURCE_KIND_LABELS = {
    'offline-defaults': t('summary.source_offline_base', { defaultValue: 'Offline (ISO base)' }),
    'offline-cache': t('summary.source_offline_cache', { defaultValue: 'Offline (cache local)' }),
    'remote-github': t('summary.source_github', { defaultValue: 'GitHub (remoto)' }),
  };

  const formatSourceKind = (value) => {
    if (!value) return t('summary.not_selected', { defaultValue: 'Não selecionada' });
    return SOURCE_KIND_LABELS[value] || t('summary.not_selected', { defaultValue: 'Não selecionada' });
  };

  const sshCount = String(wizard.adminAuthorizedKeys || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
  const layoutLabel = wizard.diskProfile === 'raid'
    ? `RAID ${String(wizard.raidLevel || '').toUpperCase()}`
    : wizard.diskMode === 'two'
      ? 'split disks'
      : 'single disk';

  const networkSummary = wizard.mgmtMode === 'dhcp'
    ? t('summary.dhcp_auto', { defaultValue: 'DHCP (automático)' })
    : `IP: ${wizard.serverIp || t('summary.pending', { defaultValue: 'pendente' })} • GW: ${wizard.mgmtGateway || t('summary.pending', { defaultValue: 'pendente' })}`;

  const hasDedicatedData = wizard.diskMode === 'two' || wizard.diskProfile === 'raid';

  const adminPassword = String(wizard.adminPassword || '');
  const adminPasswordConfirm = String(wizard.adminPasswordConfirm || '');
  const passwordFilled = adminPassword.length > 0;
  const passwordStrong = isStrongPassword(adminPassword);
  const passwordMatches = passwordFilled && adminPassword === adminPasswordConfirm;
  const allowWeak = Boolean(wizard.allowWeakPassword);

  const srvDataActive = shouldRecommendSrvData(wizard.profileId, wizard.selectedFeatures);
  const srvDataReason = explainSrvDataReason(wizard.profileId, wizard.selectedFeatures);
  const profileObj = getProfileById(wizard.profileId);

  const { systemFeatures, homeFeatures } = useMemo(() => {
    const sys = [];
    const home = [];
    for (const id of (wizard.selectedFeatures || [])) {
      const f = FEATURE_CATALOG.find(x => x.id === id);
      if (!f) continue;
      if (f.level === 'system') sys.push(f);
      else if (f.level === 'user') home.push(f);
    }
    return { systemFeatures: sys, homeFeatures: home };
  }, [wizard.selectedFeatures]);

  const [importError, setImportError] = useState('');

  const handleExportPlan = useCallback(async () => {
    const payload = buildInstallPlanPayload(wizard);
    const content = JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: 'application/json' });

    // Try File System Access API (showSaveFilePicker)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'kryonix-install-plan.json',
          types: [{
            description: 'JSON Plan',
            accept: { 'application/json': ['.json'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[Summary] showSaveFilePicker failed, falling back:', err);
        }
      }
    }

    // Fallback: classic download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kryonix-install-plan.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [wizard]);

  const handleImportPlan = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        // Basic validation: check required top-level fields
        if (!json.version || !json.network || !json.disk || !json.admin) {
          throw new Error(t('summary.json_missing_fields', { defaultValue: 'JSON não contém campos obrigatórios do plano de instalação.' }));
        }
        // Convert payload back to wizard draft fields where possible
        const draftPatch = {};
        if (json.network) {
          if (json.network.hostname) draftPatch.hostName = json.network.hostname;
          if (json.network.interface) draftPatch.mgmtInterface = json.network.interface;
          if (json.network.mode) draftPatch.mgmtMode = json.network.mode === 'static' ? 'static' : 'dhcp';
          if (json.network.serverIp && json.network.serverIp !== '0.0.0.0') draftPatch.serverIp = json.network.serverIp;
          if (json.network.gateway) draftPatch.mgmtGateway = json.network.gateway;
          if (json.network.dns?.length) draftPatch.mgmtDns = json.network.dns.join(',');
          if (json.network.httpPort) draftPatch.httpPort = json.network.httpPort;
          if (json.network.wan) {
            if (json.network.wan.interface) draftPatch.wanInterface = json.network.wan.interface;
            if (json.network.wan.mode) draftPatch.wanMode = json.network.wan.mode;
            if (json.network.wan.address) draftPatch.wanAddress = json.network.wan.address;
            if (json.network.wan.gateway) draftPatch.wanGateway = json.network.wan.gateway;
            if (json.network.wan.dns?.length) draftPatch.wanDns = json.network.wan.dns.join(',');
            if (json.network.wan.pppoeUser) draftPatch.pppoeUser = json.network.wan.pppoeUser;
          }
        }
        if (json.disk) {
          if (json.disk.mode) draftPatch.diskMode = json.disk.mode;
          if (json.disk.profile) draftPatch.diskProfile = json.disk.profile;
          if (json.disk.sysDisk) draftPatch.sysDisk = json.disk.sysDisk;
          if (json.disk.dataDisk) draftPatch.dataDisk = json.disk.dataDisk;
          if (json.disk.selectedDisks) draftPatch.selectedDisks = json.disk.selectedDisks;
          if (json.disk.raidLevel) draftPatch.raidLevel = json.disk.raidLevel;
          if (json.disk.luksEnabled !== undefined) draftPatch.luksEnabled = json.disk.luksEnabled;
          if (json.disk.rootFs) draftPatch.rootFs = json.disk.rootFs;
          if (json.disk.dataFs) draftPatch.dataFs = json.disk.dataFs;
        }
        if (json.locale) {
          if (json.locale.country) draftPatch.country = json.locale.country;
          if (json.locale.timezone) draftPatch.timeZone = json.locale.timezone;
          if (json.locale.locale) draftPatch.locale = json.locale.locale;
          if (json.locale.keymap) draftPatch.keyMap = json.locale.keymap;
        }
        if (json.admin) {
          if (json.admin.user) draftPatch.adminUser = json.admin.user;
          if (json.admin.fullName) draftPatch.adminFullName = json.admin.fullName;
          if (json.admin.email) draftPatch.adminEmail = json.admin.email;
          if (json.admin.authorizedKeys) draftPatch.adminAuthorizedKeys = json.admin.authorizedKeys.join('\n');
        }
        if (json.profile?.id) draftPatch.profileId = json.profile.id;
        if (json.remoteAccess?.enabled !== undefined) draftPatch.targetRemoteAccessEnabled = json.remoteAccess.enabled;
        if (json.security?.allowWeakPassword !== undefined) draftPatch.allowWeakPassword = json.security.allowWeakPassword;

        onChange(draftPatch);
        setImportError('');
        // Reset file input so same file can be imported again if needed
        event.target.value = '';
      } catch (err) {
        console.error('[Summary] Import error:', err);
        setImportError(err instanceof Error ? err.message : t('summary.import_failed', { defaultValue: 'Falha ao importar JSON.' }));
      }
    };
    reader.onerror = () => setImportError(t('summary.read_error', { defaultValue: 'Erro ao ler arquivo.' }));
    reader.readAsText(file);
  }, [onChange, t]);

  return (
    <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[7fr_3fr] animate-fade-in-up">
      <section className="flex flex-col min-h-0 overflow-y-auto pr-2 pb-6 custom-scrollbar">


        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-xl p-4 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-bg-elevated/50">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-text-muted">{t('summary.install_host', { defaultValue: 'Instalação & Host' })}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-text-primary">{t('summary.hostname', { defaultValue: 'Hostname:' })} {wizard.hostName || t('summary.pending', { defaultValue: 'pendente' })}</div>
            <div className="mt-1 text-[13px] text-slate-600 dark:text-text-secondary">{t('summary.source', { defaultValue: 'Fonte:' })} {formatSourceKind(wizard.sourceKind)}</div>
            <div className="mt-1 text-[13px] text-slate-500 dark:text-text-muted">{t('summary.remote_access', { defaultValue: 'Acesso Remoto:' })} {wizard.targetRemoteAccessEnabled ? t('summary.enabled', { defaultValue: 'Ativado' }) : t('summary.disabled', { defaultValue: 'Desativado' })}</div>
            <div className="mt-1 text-[13px] text-slate-500 dark:text-text-muted">
              {t('summary.profile', { defaultValue: 'Perfil:' })} {profileObj ? profileObj.name : t('summary.none', { defaultValue: 'Nenhum' })}
            </div>
          </div>
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-xl p-4 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-bg-elevated/50">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-text-muted">{t('summary.network')}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-text-primary">{t('summary.wan', { defaultValue: 'WAN:' })} {wizard.wanInterface ? `${wizard.wanInterface} • ${t('summary.mode', { defaultValue: 'modo' })} ${wizard.wanMode}` : t('summary.optional_disabled', { defaultValue: 'opcional / desabilitada' })}</div>
            <div className="mt-1 text-[13px] text-slate-600 dark:text-text-secondary">{t('summary.lan_pxe', { defaultValue: 'LAN/PXE:' })} {wizard.mgmtInterface || t('summary.no_interface', { defaultValue: 'sem interface' })}</div>
            <div className="mt-1 text-[13px] text-slate-500 dark:text-text-muted">{networkSummary}</div>
          </div>
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-xl p-4 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-bg-elevated/50">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-text-muted">{t('summary.disks', { defaultValue: 'Discos' })}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-text-primary">{t('summary.layout', { defaultValue: 'Layout:' })} {layoutLabel}</div>
            <div className="mt-1 text-[13px] text-slate-600 dark:text-text-secondary">{t('summary.system', { defaultValue: 'Sistema:' })} {wizard.sysDisk || '—'}</div>
            <div className="mt-1 text-[13px] text-slate-500 dark:text-text-muted">
              {wizard.diskProfile === 'raid'
                ? `${t('summary.members', { defaultValue: 'Membros:' })} ${(wizard.selectedDisks || []).join(', ') || '—'}`
                : hasDedicatedData
                  ? `${t('summary.data', { defaultValue: 'Dados:' })} ${wizard.dataDisk || '—'} -> /srv/data`
                  : t('summary.internal_subvol', { defaultValue: 'Dados: subvol interno no mesmo BTRFS (sem disco dedicado)' })}
            </div>
          </div>
          <div className="bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-xl p-4 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-bg-elevated/50">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-text-muted">{t('summary.admin', { defaultValue: 'Admin' })}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-text-primary">{wizard.adminFullName || wizard.adminUser} ({wizard.adminUser})</div>
            <div className="mt-1 text-[13px] text-slate-600 dark:text-text-secondary">{wizard.adminEmail}</div>
            <div className="mt-1 text-[13px] text-slate-500 dark:text-text-muted">{sshCount} {t('summary.ssh_keys', { defaultValue: 'chave(s) SSH' })}</div>
          </div>
        </div>

        {/* /srv/data panel */}
        <div className={`mt-4 rounded-2xl border p-4 text-sm ${srvDataActive ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-slate-400/20 bg-slate-400/5 text-slate-300'}`}>
          <div className="font-bold flex items-center gap-2">
            <span>{srvDataActive ? '✓' : '○'}</span>
            /srv/data {srvDataActive ? t('summary.activated', { defaultValue: 'ativado' }) : t('summary.not_activated', { defaultValue: 'não ativado' })}
          </div>
          <p className="mt-2">
            {srvDataActive
              ? `${t('summary.reason', { defaultValue: 'Motivo:' })} ${srvDataReason}. ${t('summary.srv_data_desc_active', { defaultValue: '/srv/data será usado para dados de servidor, bancos, modelos, RAG, Neo4j, LightRAG e serviços persistentes.' })}`
              : `${t('summary.reason', { defaultValue: 'Motivo:' })} ${srvDataReason}. ${t('summary.srv_data_desc_inactive', { defaultValue: 'Este perfil não requer volume de dados persistente separado.' })}`}
          </p>
        </div>

        {/* Features separadas */}
        {systemFeatures.length > 0 && (
          <div className="mt-4 bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-text-muted">{t('summary.system_features', { defaultValue: 'Features de Sistema' })}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {systemFeatures.map(f => (
                <span key={f.id} className="px-2.5 py-1 text-xs rounded-lg font-medium bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20">
                  {f.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {homeFeatures.length > 0 && (
          <div className="mt-4 bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-text-muted">{t('summary.home_features', { defaultValue: 'Features Home Manager' })}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {homeFeatures.map(f => (
                <span key={f.id} className="px-2.5 py-1 text-xs rounded-lg font-medium bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20">
                  {f.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-danger/20 bg-danger/5 dark:bg-danger/10 p-4 shadow-sm text-[13px] text-danger">
          <div className="font-bold flex items-center gap-2"><span className="text-base">⚠</span> {t('summary.destructive_plan', { defaultValue: 'Plano final de disco com confirmação destrutiva' })}</div>
          <p className="mt-1">{t('summary.destructive_plan_desc', { defaultValue: 'Os discos selecionados podem ser limpos e reformatados. Confira novamente sistema, dados, rede e usuário antes de prosseguir.' })}</p>
        </div>
      </section>

      <section className="flex flex-col min-h-0 bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-2xl shadow-sm p-6 overflow-y-auto custom-scrollbar">
        <div>
          <div className="rounded-xl border border-slate-200/50 dark:border-white/10 bg-black/5 backdrop-blur-md dark:bg-white/5 backdrop-blur-md p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-text-muted">{t('summary.checklist', { defaultValue: 'Checklist crítico' })}</div>
            <ul className="mt-3 space-y-2 text-[13px] font-medium text-slate-600 dark:text-text-secondary">
              <li>• {t('summary.eula_accepted', { defaultValue: 'EULA aceito:' })} {uiState.eulaAccepted ? t('summary.yes', { defaultValue: 'sim' }) : t('summary.no', { defaultValue: 'não' })}</li>
              <li>• {t('summary.hostname', { defaultValue: 'Hostname:' })} {wizard.hostName ? t('summary.yes', { defaultValue: 'sim' }) : t('summary.no', { defaultValue: 'não' })}</li>
              <li>• {t('summary.profile_selected', { defaultValue: 'Perfil selecionado:' })} {wizard.profileId ? t('summary.yes', { defaultValue: 'sim' }) : t('summary.no', { defaultValue: 'não' })}</li>
              <li>• {t('summary.system_features_count', { defaultValue: 'Features sistema:' })} {systemFeatures.length} {t('summary.activated_plural', { defaultValue: 'ativadas' })}</li>
              <li>• {t('summary.user_features_count', { defaultValue: 'Features usuário:' })} {homeFeatures.length} {t('summary.activated_plural', { defaultValue: 'ativadas' })}</li>
              <li>• /srv/data: {srvDataActive ? t('summary.yes', { defaultValue: 'sim' }) : t('summary.no', { defaultValue: 'não' })}</li>
              <li>• {t('summary.strong_password', { defaultValue: 'Senha forte:' })} {' '}
                {allowWeak
                  ? t('summary.ignored_lab_mode', { defaultValue: 'ignorada por modo laboratório' })
                  : passwordStrong ? t('summary.yes', { defaultValue: 'sim' }) : t('summary.no', { defaultValue: 'não' })}
              </li>
              <li>• {t('summary.password_match', { defaultValue: 'Senha confere:' })} {passwordMatches ? t('summary.yes', { defaultValue: 'sim' }) : t('summary.no', { defaultValue: 'não' })}</li>
              <li>• {t('summary.destructive_understood', { defaultValue: 'Plano destrutivo entendido:' })} {uiState.destructiveConfirmed ? t('summary.yes', { defaultValue: 'sim' }) : t('summary.no', { defaultValue: 'não' })}</li>
            </ul>

            {allowWeak ? (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                {t('summary.lab_mode_warning', { defaultValue: 'Modo laboratório ativo: regra de senha forte desativada. Não use este perfil para uso real.' })}
              </div>
            ) : null}
            {validation?.warnings?.length > 0 ? (
              <div className="mt-4 rounded-xl border border-warning/20 bg-warning/5 dark:bg-warning/10 px-3 py-2 text-warning text-xs font-medium">
                {validation.warnings[0]}
              </div>
            ) : null}
          </div>

          <label className={`mt-5 flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all ${
            uiState.destructiveConfirmed
              ? 'bg-warning/10 border-warning/40 shadow-inner'
              : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
          }`}>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-white/20 bg-black/20 text-warning focus:ring-warning/50 shrink-0 cursor-pointer appearance-none checked:appearance-auto"
              checked={uiState.destructiveConfirmed}
              onChange={(event) => onChange({ destructiveConfirmed: event.target.checked })}
            />
            <div className="flex flex-col">
              <span className={`text-[15px] font-bold ${uiState.destructiveConfirmed ? 'text-warning' : 'text-white'}`}>
                {t('summary.confirm_destructive', { defaultValue: 'Confirmo que este plano pode apagar dados' })}
              </span>
              <span className={`text-[13px] font-medium mt-1 ${uiState.destructiveConfirmed ? 'text-warning/80' : 'text-slate-400'}`}>
                {t('summary.confirm_destructive_desc', { defaultValue: 'Entendo que os discos selecionados serão alterados irreversivelmente.' })}
              </span>
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-3 mt-4">
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
              onClick={handleExportPlan}
            >
              {t('summary.export_json', { defaultValue: 'Exportar plano JSON' })}
            </button>
            <label className="flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer">
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={handleImportPlan}
              />
              {t('summary.import_json', { defaultValue: 'Importar plano JSON' })}
            </label>
          </div>
          {importError && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
              {importError}
            </div>
          )}
          <div className="flex-1 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
            {t('summary.next_step_desc', { defaultValue: 'A próxima etapa gera o plano via backend e permite iniciar a instalação com logs ao vivo.' })}
          </div>
        </div>
      </section>
    </div>
  );
}
