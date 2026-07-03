import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import KxCombobox from '../components/KxCombobox.jsx';
import EagleLogo from '../components/EagleLogo.jsx';
import {
  allCountryCodes,
  countryPresets,
  fallbackKeymaps,
  fallbackLocales,
  getRegionName,
  parseLocaleLabel,
} from '../data/localizationMeta.js';
import { installerApi } from '../utils/installerApi.js';
import {
  fetchCanonicalCatalog,
  normalizeCountryCanonicalKey,
  normalizeCountryDisplayValue,
  normalizeKeymapCanonicalKey,
  normalizeKeymapDisplayValue,
  normalizeLocaleCanonicalKey,
  normalizeLocaleDisplayValue,
} from '../utils/localizationCatalog.js';

export default function Welcome({ wizard, onChange }) {
  const { t, i18n } = useTranslation();
  const [countries, setCountries] = useState([]);
  const [locales, setLocales] = useState([]);
  const [keymaps, setKeymaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [degradedMode, setDegradedMode] = useState(false);
  const [version, setVersion] = useState(null);
  const [detections, setDetections] = useState([]);

  useEffect(() => {
    fetch('/version')
      .then(r => r.ok ? r.json() : null)
      .then(data => setVersion(data))
      .catch(() => {});

    fetch('/api/detection')
      .then(r => r.ok ? r.json() : [])
      .then(data => setDetections(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        const [countriesData, localesData, keymapsData] = await Promise.all([
          fetchCanonicalCatalog(installerApi.getCountries, allCountryCodes, {
            normalizeDisplayValue: normalizeCountryDisplayValue,
            toCanonicalKey: normalizeCountryCanonicalKey,
          }),
          fetchCanonicalCatalog(installerApi.getLocales, fallbackLocales, {
            normalizeDisplayValue: normalizeLocaleDisplayValue,
            toCanonicalKey: normalizeLocaleCanonicalKey,
          }),
          fetchCanonicalCatalog(installerApi.getKeymaps, fallbackKeymaps, {
            normalizeDisplayValue: normalizeKeymapDisplayValue,
            toCanonicalKey: normalizeKeymapCanonicalKey,
          }),
        ]);

        if (!cancelled) {
          setCountries(countriesData.items);
          setLocales(localesData.items);
          setKeymaps(keymapsData.items);
          setDegradedMode(Boolean(countriesData.usedFallback || localesData.usedFallback || keymapsData.usedFallback));
        }
      } catch {
        // error handling handled implicitly by fallbacks in fetchCanonicalCatalog
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasKryonix = detections.some(d => d.is_kryonix);
  const selectedPreset = countryPresets[wizard.country] || null;
  const availableCountries = useMemo(() => countries.filter(Boolean).sort((a, b) => a.localeCompare(b)), [countries]);

  const countryOptions = useMemo(() => {
    return availableCountries.map(code => ({
      id: code,
      label: getRegionName(code),
      desc: code
    }));
  }, [availableCountries]);

  const localeOptions = [
  { id: 'pt-BR', label: 'Português do Brasil', desc: 'pt-BR' },
  { id: 'en-US', label: 'English (United States)', desc: 'en-US' },
  { id: 'es-ES', label: 'Español', desc: 'es-ES' }
];

  const keymapOptions = useMemo(() => {
    return keymaps.map(keymap => ({
      id: keymap,
      label: keymap,
      desc: ''
    }));
  }, [keymaps]);

  function applyCountry(value) {
    onChange((previous) => ({
      country: value,
    }));
  }

  function applySuggestions() {
    if (selectedPreset) {
      onChange((previous) => ({
        locale: selectedPreset.locale || previous.locale,
        keyMap: selectedPreset.keyMap || previous.keyMap,
        timeZone: selectedPreset.timeZone || previous.timeZone,
        timeZonePin: null,
        timeZoneLatitude: null,
        timeZoneLongitude: null,
        timeZoneCountryCode: '',
      }));
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto w-full px-4 text-center animate-fade-in-up pb-8 custom-scrollbar overflow-y-auto">
      {/* Branding */}
      <div className="mt-4 mb-10 flex flex-col items-center">
        <div className="mb-4 bg-transparent">
          <EagleLogo className="w-64 h-64 md:w-72 md:h-72" />
        </div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
          {t('welcome.title')}
        </h2>
        <p className="text-base text-slate-500 dark:text-slate-400 max-w-lg font-medium">
          {t('welcome.subtitle')}
        </p>
      </div>

      {/* Detections */}
      {hasKryonix && (
        <div className="mb-8 w-full max-w-lg rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-4 flex gap-4 text-left mx-auto">
          <div className="mt-1"><EagleLogo className="w-5 h-5 text-accent-blue" /></div>
          <div>
            <div className="text-sm font-bold text-accent-blue mb-1">
              {t('welcome.infrastructureDetected')}
            </div>
            <p className="text-sm text-slate-600 dark:text-text-secondary leading-relaxed" dangerouslySetInnerHTML={{ __html: t('welcome.infrastructureDetectedDesc', { hostname: `<span class="font-mono bg-white dark:bg-bg-elevated px-1.5 py-0.5 rounded text-xs border border-slate-200 dark:border-white/10">${detections[0].hostname}</span>` }) }} />
          </div>
        </div>
      )}

      {/* Localization Selectors */}
      <div className="w-full max-w-md flex flex-col mx-auto bg-white/20 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/5">
        <div className="flex flex-col gap-5 text-left">
          <KxCombobox
            label={t('welcome.country').replace(/^[1-3]\.\s*/, '')}
            options={countryOptions}
            value={wizard.country}
            onChange={applyCountry}
            placeholder={loading ? t('welcome.loading') : t('welcome.country').replace(/^[1-3]\.\s*/, '')}
            disabled={loading}
          />

          <KxCombobox
            label={t('welcome.language').replace(/^[1-3]\.\s*/, '')}
            options={localeOptions}
            value={wizard.uiLanguage}
            onChange={(val) => onChange({ uiLanguage: val })}
            placeholder={loading ? t('welcome.loading') : t('welcome.language').replace(/^[1-3]\.\s*/, '')}
            disabled={loading}
          />

          <KxCombobox
            label={t('welcome.keyboard').replace(/^[1-3]\.\s*/, '')}
            options={keymapOptions}
            value={wizard.keyMap}
            onChange={(val) => onChange({ keyMap: normalizeKeymapDisplayValue(val) })}
            placeholder={loading ? t('welcome.loading') : t('welcome.keyboard').replace(/^[1-3]\.\s*/, '')}
            disabled={loading}
          />
        </div>

        <div className="border-t border-slate-200/50 dark:border-white/10 mt-6 pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{t('welcome.timezone')}</span>
              <span className="text-[13px] font-semibold text-slate-900 dark:text-white mt-1">{selectedPreset?.timeZone || wizard.timeZone || '—'}</span>
            </div>
            <button
              type="button"
              className="btn-secondary whitespace-nowrap text-xs px-4 py-2 bg-white/30 dark:bg-white/10 hover:bg-white/50 dark:hover:bg-white/20 border border-white/40 dark:border-white/10 shadow-sm backdrop-blur-md transition-all text-slate-800 dark:text-slate-200"
              onClick={applySuggestions}
              disabled={!selectedPreset}
            >
              {t('welcome.applySuggestions')}
            </button>
          </div>
          {!selectedPreset && wizard.country && (
            <div className="text-[11px] text-slate-500 mt-3 text-center">{t('welcome.noSuggestions') || "No default suggestions for the selected country."}</div>
          )}
        </div>
      </div>

      {version && (
        <div className="mt-12 text-[10px] text-slate-400 dark:text-slate-600 font-mono text-center">
          {version.KRYONIX_PRETTY_NAME} | {version.KRYONIX_REV?.substring(0, 8)} | {version.KRYONIX_BUILD_TIME}
        </div>
      )}
    </div>
  );
}
