import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Languages, Keyboard } from 'lucide-react';
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
    const preset = countryPresets[value];
    onChange((previous) => ({
      country: value,
      ...(preset
        ? {
            locale: preset.locale || previous.locale,
            keyMap: preset.keyMap || previous.keyMap,
            consoleKeymap: preset.keyMap || previous.consoleKeymap,
            timeZone: preset.timeZone || previous.timeZone,
            timeZonePin: null,
            timeZoneLatitude: null,
            timeZoneLongitude: null,
            timeZoneCountryCode: '',
          }
        : {}),
    }));
  }

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full px-4 text-center animate-fade-in-up pb-6 custom-scrollbar overflow-y-auto">
      {/* Header */}
      <div className="mt-2 mb-6 flex flex-col items-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-accent-blue/10 text-accent-blue border border-accent-blue/20 mb-3 backdrop-blur-md">
          <Globe className="w-3.5 h-3.5" />
          Kryonix OS
        </span>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
          {t('welcome.title')}
        </h2>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 max-w-md font-medium leading-relaxed">
          {t('welcome.subtitle')}
        </p>
      </div>

      {/* Detections Banner */}
      {hasKryonix && (
        <div className="mb-6 w-full max-w-lg rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-4 flex gap-3 text-left mx-auto backdrop-blur-md">
          <div className="mt-0.5"><EagleLogo className="w-5 h-5 text-accent-blue" /></div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-accent-blue mb-0.5">
              {t('welcome.infrastructureDetected')}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('welcome.infrastructureDetectedDesc', { hostname: `<span class="font-mono bg-white dark:bg-white/10 px-1.5 py-0.5 rounded text-[11px] border border-slate-200 dark:border-white/10">${detections[0].hostname}</span>` }) }} />
          </div>
        </div>
      )}

      {/* Main Form Card */}
      <div className="w-full max-w-lg bg-white/40 dark:bg-slate-900/40 border border-slate-200/80 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.06)] backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/5 flex flex-col gap-6 text-left">
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 mb-1 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider">
              <Globe className="w-4 h-4 text-accent-blue" />
              <span>{t('welcome.country').replace(/^[1-3]\.\s*/, '')}</span>
            </div>
            <KxCombobox
              options={countryOptions}
              value={wizard.country}
              onChange={applyCountry}
              placeholder={loading ? t('welcome.loading') : t('welcome.country').replace(/^[1-3]\.\s*/, '')}
              disabled={loading}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider">
              <Languages className="w-4 h-4 text-accent-blue" />
              <span>{t('welcome.language').replace(/^[1-3]\.\s*/, '')}</span>
            </div>
            <KxCombobox
              options={localeOptions}
              value={wizard.uiLanguage}
              onChange={(val) => onChange({ uiLanguage: val })}
              placeholder={loading ? t('welcome.loading') : t('welcome.language').replace(/^[1-3]\.\s*/, '')}
              disabled={loading}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider">
              <Keyboard className="w-4 h-4 text-accent-blue" />
              <span>{t('welcome.keyboard').replace(/^[1-3]\.\s*/, '')}</span>
            </div>
            <KxCombobox
              options={keymapOptions}
              value={wizard.keyMap || wizard.consoleKeymap}
              onChange={(val) => {
                const normalized = normalizeKeymapDisplayValue(val);
                onChange({ keyMap: normalized, consoleKeymap: normalized });
              }}
              placeholder={loading ? t('welcome.loading') : t('welcome.keyboard').replace(/^[1-3]\.\s*/, '')}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {version && (
        <div className="mt-8 text-[10px] text-slate-400 dark:text-slate-500 font-mono text-center tracking-wider opacity-75">
          {version.KRYONIX_PRETTY_NAME} | {version.KRYONIX_REV?.substring(0, 8)} | {version.KRYONIX_BUILD_TIME}
        </div>
      )}
    </div>
  );
}

