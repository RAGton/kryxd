import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FEATURE_CATALOG } from '../data/featureCatalog.js';
import { PROFILE_CATALOG, getFeaturesForProfile } from '../data/profileCatalog.js';
import {
  Monitor,
  Gamepad2,
  Cpu,
  Layers,
  Shield,
  HardDrive,
  Server,
  Activity,
  Search,
  Sparkles,
  Zap,
  AlertTriangle,
  X,
  RefreshCw,
  Trash2,
  Brain,
  Wifi,
  Box,
  CheckCircle2
} from 'lucide-react';

export default function SystemFeatures({ wizard, onChange }) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [confirmModalFeature, setConfirmModalFeature] = useState(null);

  const systemFeatures = useMemo(() => {
    return FEATURE_CATALOG.filter(f => f.level === 'system');
  }, []);

  const selectedSet = useMemo(() => {
    return new Set(wizard.selectedFeatures || []);
  }, [wizard.selectedFeatures]);

  // Statistics calculation
  const stats = useMemo(() => {
    const selectedObjs = systemFeatures.filter(f => selectedSet.has(f.id));
    const totalDiskGb = selectedObjs.reduce((sum, f) => sum + (f.storage?.estimatedDiskGb || 0), 0);
    const maxRamGb = Math.max(0, ...selectedObjs.map(f => f.hardware?.minRamGb || 0));
    const requiresSrvData = selectedObjs.some(f => f.storage?.requiresSrvData || f.id === 'storage.srv-data');
    const requiresGpu = selectedObjs.some(f => f.hardware?.gpuRecommended);
    const hasKve = selectedSet.has('virtualization.incus');
    return {
      count: selectedObjs.length,
      totalDiskGb,
      maxRamGb,
      requiresSrvData,
      requiresGpu,
      hasKve
    };
  }, [systemFeatures, selectedSet]);

  // Icon mapping
  const getFeatureIcon = (feature) => {
    const id = feature.id;
    const domain = feature.domain;
    if (id.includes('gamer') || id.includes('steam') || id.includes('mangohud') || id.includes('proton')) return Gamepad2;
    if (id.includes('incus') || id.includes('kve')) return Zap;
    if (id.includes('ollama') || id.includes('brain') || id.includes('neo4j') || id.includes('lightrag') || id === 'desktop.ai') return Brain;
    if (domain === 'desktop') return Monitor;
    if (domain === 'virtualization') return Zap;
    if (domain === 'server') return Server;
    if (domain === 'storage') return HardDrive;
    if (domain === 'security') return Shield;
    if (domain === 'remote') return Wifi;
    if (domain === 'observability') return Activity;
    if (domain === 'mcp') return Box;
    return Cpu;
  };

  const domainTabs = [
    { id: 'all', label: t('system_features.tab_all', { defaultValue: 'Todas' }), icon: Layers },
    { id: 'desktop', label: t('system_features.tab_desktop', { defaultValue: 'Desktop & IA' }), icon: Monitor },
    { id: 'gaming', label: t('system_features.tab_gaming', { defaultValue: 'Gamer & Performance' }), icon: Gamepad2 },
    { id: 'ai', label: t('system_features.tab_ai', { defaultValue: 'IA Local' }), icon: Brain },
    { id: 'virtualization', label: t('system_features.tab_virtualization', { defaultValue: 'Virtualização & KVE' }), icon: Zap },
    { id: 'remote', label: t('system_features.tab_remote', { defaultValue: 'Rede & Acesso' }), icon: Wifi },
    { id: 'storage', label: t('system_features.tab_storage', { defaultValue: 'Armazenamento' }), icon: HardDrive },
    { id: 'security', label: t('system_features.tab_security', { defaultValue: 'Segurança' }), icon: Shield },
    { id: 'observability', label: t('system_features.tab_observability', { defaultValue: 'Observabilidade' }), icon: Activity }
  ];

  // Filter features based on active tab and search query
  const filteredFeatures = useMemo(() => {
    return systemFeatures.filter(f => {
      // Domain tab filter
      if (activeTab === 'desktop' && f.domain !== 'desktop') return false;
      if (activeTab === 'gaming' && !f.id.includes('gamer') && f.category !== 'Gaming') return false;
      if (activeTab === 'ai' && f.domain !== 'ai' && f.id !== 'desktop.ai') return false;
      if (activeTab === 'virtualization' && f.domain !== 'virtualization' && f.category !== 'Virtualization' && f.category !== 'Hypervisor' && f.category !== 'Containers') return false;
      if (activeTab === 'remote' && f.domain !== 'remote') return false;
      if (activeTab === 'storage' && f.domain !== 'storage') return false;
      if (activeTab === 'security' && f.domain !== 'security') return false;
      if (activeTab === 'observability' && f.domain !== 'observability' && f.domain !== 'mcp') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = f.name.toLowerCase().includes(query);
        const matchDesc = f.description.toLowerCase().includes(query);
        const matchCategory = f.category.toLowerCase().includes(query);
        const matchBadges = f.badges?.some(b => b.toLowerCase().includes(query));
        return matchName || matchDesc || matchCategory || matchBadges;
      }
      return true;
    });
  }, [systemFeatures, activeTab, searchQuery]);

  const handleToggle = (feature) => {
    if (feature.status === 'stub' || feature.status === 'legacy') return;

    if (!selectedSet.has(feature.id) && feature.status === 'partial') {
      setConfirmModalFeature(feature);
      return;
    }

    applyToggle(feature.id);
  };

  const applyToggle = (featureId) => {
    const feature = FEATURE_CATALOG.find(f => f.id === featureId);
    const newSelected = new Set(selectedSet);

    if (newSelected.has(featureId)) {
      newSelected.delete(featureId);
    } else {
      newSelected.add(featureId);

      // Auto-enable essential dependencies if missing
      if (feature?.requires) {
        feature.requires.forEach(reqId => {
          const reqFeature = FEATURE_CATALOG.find(f => f.id === reqId);
          if (reqFeature && reqFeature.status !== 'stub' && reqFeature.status !== 'legacy') {
            newSelected.add(reqId);
          }
        });
      }
    }

    onChange({ selectedFeatures: Array.from(newSelected) });
  };

  // Preset handlers
  const applyPreset = (presetType) => {
    let presetFeatureIds = [];
    if (presetType === 'desktop-standard') {
      presetFeatureIds = ['desktop.plasma', 'desktop.audio', 'desktop.bluetooth', 'security.firewall', 'remote.openssh'];
    } else if (presetType === 'desktop-ai') {
      presetFeatureIds = ['desktop.plasma', 'desktop.ai', 'desktop.audio', 'desktop.bluetooth', 'ai.ollama', 'ai.open-webui', 'storage.srv-data', 'security.firewall', 'remote.openssh'];
    } else if (presetType === 'desktop-gamer') {
      presetFeatureIds = ['desktop.plasma', 'desktop.gamer', 'desktop.audio', 'desktop.bluetooth', 'gamer.steam', 'gamer.gamemode', 'gamer.mangohud', 'gamer.proton', 'gamer.controllers', 'security.firewall', 'remote.openssh'];
    } else if (presetType === 'kve-server') {
      presetFeatureIds = ['virtualization.incus', 'virtualization.podman', 'storage.srv-data', 'security.firewall', 'remote.openssh', 'observability.prometheus'];
    }

    // Merge system preset features while preserving user-level features
    const nonSystemFeatures = (wizard.selectedFeatures || []).filter(id => {
      const f = FEATURE_CATALOG.find(feat => feat.id === id);
      return f && f.level !== 'system';
    });

    const merged = Array.from(new Set([...nonSystemFeatures, ...presetFeatureIds]));
    onChange({ selectedFeatures: merged });
  };

  const handleProfileSelect = (profileId) => {
    const defaultFeatures = getFeaturesForProfile(profileId);
    onChange({
      profileId,
      selectedFeatures: defaultFeatures
    });
  };

  const handleRestoreProfile = () => {
    const profileDefaults = getFeaturesForProfile(wizard.profileId || 'desktop');
    onChange({ selectedFeatures: profileDefaults });
  };

  const handleClearAllSystem = () => {
    const nonSystemFeatures = (wizard.selectedFeatures || []).filter(id => {
      const f = FEATURE_CATALOG.find(feat => feat.id === id);
      return f && f.level !== 'system';
    });
    onChange({ selectedFeatures: nonSystemFeatures });
  };

  const currentProfileObj = PROFILE_CATALOG.find(p => p.id === wizard.profileId);

  return (
    <div className="wizard-content space-y-6 h-full overflow-y-auto min-h-0 pb-6 pr-1 custom-scrollbar">

      {/* Preset Action Header Cards */}
      <div className="bg-slate-900/60 rounded-2xl border border-white/10 p-4 backdrop-blur-md">
        
        {/* Base Profile Selector Row */}
        <div className="flex items-center gap-2 mb-3.5 pb-3 border-b border-white/10 overflow-x-auto custom-scrollbar">
          <span className="text-xs font-semibold text-slate-300 shrink-0 flex items-center gap-1.5 mr-1">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            {t('system_features.base_profile', { defaultValue: 'Perfil Base:' })}
          </span>
          {PROFILE_CATALOG.filter(p => !wizard.isThinkServer || p.mode === 'server').map((profile) => {
            const isActive = wizard.profileId === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleProfileSelect(profile.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 border ${
                  isActive
                    ? 'bg-blue-600/30 border-blue-400 text-white font-bold shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                }`}
              >
                {profile.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white tracking-wide">
                {t('system_features.preset_title', { defaultValue: 'Presets Rápidos de Recursos do Sistema' })}
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              {t('system_features.preset_subtitle', { defaultValue: 'Selecione uma configuração pré-otimizada ou personalize botão por botão.' })}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            {currentProfileObj && (
              <button
                type="button"
                onClick={handleRestoreProfile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors"
                title={t('system_features.restore_tooltip', { defaultValue: 'Restaurar padrão do perfil ativo' })}
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                {t('system_features.restore_profile', { defaultValue: 'Padrão ({{name}})', name: currentProfileObj.name })}
              </button>
            )}
            <button
              type="button"
              onClick={handleClearAllSystem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-xs text-red-300 font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              {t('system_features.clear_resources', { defaultValue: 'Limpar Recursos' })}
            </button>
          </div>
        </div>

        {/* Preset Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => applyPreset('desktop-standard')}
            className="group relative text-left p-3.5 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-900/30 to-slate-900/60 hover:border-blue-400/60 hover:bg-blue-950/40 transition-all shadow-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 group-hover:scale-105 transition-transform">
                <Monitor className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                {t('system_features.badge_plasma6', { defaultValue: 'Plasma 6' })}
              </span>
            </div>
            <h3 className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
              {t('system_features.preset_desktop', { defaultValue: 'Desktop Padrão' })}
            </h3>
            <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
              {t('system_features.preset_desktop_desc', { defaultValue: 'Interface Wayland KDE Plasma com áudio PipeWire, Bluetooth e SSH.' })}
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('desktop-ai')}
            className="group relative text-left p-3.5 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-900/30 to-slate-900/60 hover:border-violet-400/60 hover:bg-violet-950/40 transition-all shadow-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="p-2 rounded-lg bg-violet-500/20 text-violet-400 group-hover:scale-105 transition-transform">
                <Brain className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
                {t('system_features.badge_ai_ready', { defaultValue: 'AI Ready' })}
              </span>
            </div>
            <h3 className="text-xs font-bold text-white group-hover:text-violet-300 transition-colors">
              {t('system_features.preset_desktop_ai', { defaultValue: 'Desktop + IA' })}
            </h3>
            <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
              {t('system_features.preset_desktop_ai_desc', { defaultValue: 'Desktop completo integrado com Ollama local, WebUI, PyTorch e /srv/data.' })}
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('desktop-gamer')}
            className="group relative text-left p-3.5 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/30 to-slate-900/60 hover:border-emerald-400/60 hover:bg-emerald-950/40 transition-all shadow-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                {t('system_features.badge_high_fps', { defaultValue: 'High-FPS' })}
              </span>
            </div>
            <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
              {t('system_features.preset_desktop_gamer', { defaultValue: 'Desktop Gamer' })}
            </h3>
            <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
              {t('system_features.preset_desktop_gamer_desc', { defaultValue: 'Kernel baixa latência, Steam, Proton GE, GameMode, MangoHud e gamepads.' })}
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('kve-server')}
            className="group relative text-left p-3.5 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-900/30 to-slate-900/60 hover:border-amber-400/60 hover:bg-amber-950/40 transition-all shadow-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 group-hover:scale-105 transition-transform">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                {t('system_features.badge_hypervisor', { defaultValue: 'Hypervisor' })}
              </span>
            </div>
            <h3 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
              {t('system_features.preset_kve', { defaultValue: 'KVE Hypervisor' })}
            </h3>
            <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
              {t('system_features.preset_kve_desc', { defaultValue: 'Kryonix Virtualization Engine (Incus), Podman, Prometheus e /srv/data.' })}
            </p>
          </button>
        </div>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-white/10 bg-slate-900/40 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t('system_features.active_features', { defaultValue: 'Features Ativas' })}
            </span>
            <span className="text-base font-extrabold text-white">
              {stats.count} {t('common.of', { defaultValue: 'de' })} {systemFeatures.length}
            </span>
          </div>
          <CheckCircle2 className="w-5 h-5 text-cyan-400 opacity-80" />
        </div>

        <div className="p-3 rounded-xl border border-white/10 bg-slate-900/40 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t('system_features.estimated_disk', { defaultValue: 'Disco Estimado' })}
            </span>
            <span className="text-base font-extrabold text-white">~{stats.totalDiskGb} GB</span>
          </div>
          <HardDrive className="w-5 h-5 text-indigo-400 opacity-80" />
        </div>

        <div className="p-3 rounded-xl border border-white/10 bg-slate-900/40 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t('system_features.min_ram', { defaultValue: 'RAM Mínima' })}
            </span>
            <span className="text-base font-extrabold text-white">
              {stats.maxRamGb > 0 ? `${stats.maxRamGb} GB` : t('common.minimal', { defaultValue: 'Mínima' })}
            </span>
          </div>
          <Cpu className="w-5 h-5 text-violet-400 opacity-80" />
        </div>

        <div className="p-3 rounded-xl border border-white/10 bg-slate-900/40 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t('system_features.srv_data_volume', { defaultValue: 'Volume /srv/data' })}
            </span>
            <span className={`text-xs font-bold ${stats.requiresSrvData ? 'text-amber-400' : 'text-slate-400'}`}>
              {stats.requiresSrvData ? t('system_features.required', { defaultValue: 'Requerido' }) : t('system_features.optional', { defaultValue: 'Opcional' })}
            </span>
          </div>
          <Zap className={`w-5 h-5 ${stats.requiresSrvData ? 'text-amber-400' : 'text-slate-600'}`} />
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Field */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('system_features.search_placeholder', { defaultValue: 'Buscar por nome, tag ou categoria (ex: KVE, Gamer, Steam, Ollama)...' })}
            className="w-full pl-9 pr-9 py-2 bg-slate-900/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tab Badges */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {domainTabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/70 hover:text-white'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Features Grid */}
      {filteredFeatures.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
          <Search className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          <p className="text-sm text-slate-400 font-medium">
            {t('system_features.no_features_found', { defaultValue: 'Nenhum recurso do sistema encontrado para esta busca.' })}
          </p>
          <button
            onClick={() => { setSearchQuery(''); setActiveTab('all'); }}
            className="mt-3 text-xs text-cyan-400 hover:underline font-semibold"
          >
            {t('system_features.clear_search', { defaultValue: 'Limpar filtros de busca' })}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filteredFeatures.map(feature => {
            const isSelected = selectedSet.has(feature.id);
            const isBlocked = feature.status === 'stub' || feature.status === 'legacy';
            const FeatureIcon = getFeatureIcon(feature);

            // Check missing requirements
            const missingReqs = (feature.requires || []).filter(reqId => !selectedSet.has(reqId));
            const hasMissingReqs = missingReqs.length > 0;

            return (
              <div
                key={feature.id}
                onClick={() => !isBlocked && handleToggle(feature)}
                className={`group relative p-4 rounded-xl border transition-all duration-200 ${
                  isBlocked
                    ? 'opacity-40 cursor-not-allowed border-white/5 bg-slate-900/20'
                    : isSelected
                    ? 'border-cyan-500/60 bg-gradient-to-br from-cyan-950/30 via-slate-900/80 to-slate-900/90 shadow-[0_0_20px_rgba(6,182,212,0.12)] cursor-pointer'
                    : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-800/40 cursor-pointer'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {/* Icon Box */}
                  <div className={`p-2.5 rounded-xl border transition-colors flex-shrink-0 mt-0.5 ${
                    isSelected
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400 group-hover:text-slate-200'
                  }`}>
                    <FeatureIcon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-sm font-bold text-white tracking-tight truncate">
                          {feature.name}
                        </span>
                        
                        {/* Domain Tag */}
                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                          {feature.category || feature.domain}
                        </span>
                      </div>

                      {/* Custom Toggle Switch */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div
                          className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                            isBlocked
                              ? 'bg-slate-800'
                              : isSelected
                              ? 'bg-cyan-500'
                              : 'bg-slate-700'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                              isSelected ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed mb-2.5">
                      {feature.description}
                    </p>

                    {/* Requirement Warning */}
                    {isSelected && hasMissingReqs && (
                      <div className="flex items-center gap-1.5 p-1.5 mb-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                        <span>{t('system_features.required_dependency', { defaultValue: 'Dependência requerida:' })} {missingReqs.map(r => FEATURE_CATALOG.find(f => f.id === r)?.name || r).join(', ')}</span>
                      </div>
                    )}

                    {/* Badges & Hardware Stats Row */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      {feature.status === 'partial' && (
                        <span className="px-1.5 py-0.5 font-bold uppercase tracking-wider rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">
                          {t('system_features.experimental_partial', { defaultValue: 'Experimental / Parcial' })}
                        </span>
                      )}
                      {feature.status === 'stub' && (
                        <span className="px-1.5 py-0.5 font-bold uppercase tracking-wider rounded border border-red-500/40 bg-red-500/10 text-red-400">
                          {t('system_features.stub_soon', { defaultValue: 'Stub / Em breve' })}
                        </span>
                      )}

                      {feature.badges?.map(badge => (
                        <span
                          key={badge}
                          className={`px-1.5 py-0.5 font-bold uppercase tracking-wider rounded border ${
                            badge.includes('KVE') || badge.includes('Engine')
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              : badge.includes('Gaming') || badge.includes('Proton')
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : badge.includes('IA') || badge.includes('GPU')
                              ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                              : 'border-slate-700 bg-slate-800/80 text-slate-300'
                          }`}
                        >
                          {badge}
                        </span>
                      ))}

                      {feature.storage?.estimatedDiskGb > 0 && (
                        <span className="px-1.5 py-0.5 font-medium rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                          +{feature.storage.estimatedDiskGb} GB
                        </span>
                      )}
                      {feature.hardware?.minRamGb > 0 && (
                        <span className="px-1.5 py-0.5 font-medium rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                          Min {feature.hardware.minRamGb} GB RAM
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Experimental Features */}
      {confirmModalFeature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-2xl border border-amber-500/30 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-white">
                {t('system_features.experimental_activation', { defaultValue: 'Ativação de Recurso Experimental' })}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('system_features.experimental_notice_before', { defaultValue: 'O recurso' })} <strong className="text-white">{confirmModalFeature.name}</strong> {t('system_features.experimental_notice', { defaultValue: 'é classificado como parcial ou experimental na distribuição Kryonix.' })}
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {confirmModalFeature.description}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalFeature(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                {t('common.cancel', { defaultValue: 'Cancelar' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  const featId = confirmModalFeature.id;
                  setConfirmModalFeature(null);
                  applyToggle(featId);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors"
              >
                {t('system_features.confirm_activation', { defaultValue: 'Confirmar Ativação' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
