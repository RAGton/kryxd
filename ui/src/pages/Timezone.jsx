import { useEffect, useMemo, useState } from 'react';
import FieldError from '../components/FieldError.jsx';
import TimezoneMap from '../components/TimezoneMap.jsx';
import KxCombobox from '../components/KxCombobox.jsx';
import { timezoneRegions } from '../data/timezoneRegions.js';
import { installerApi } from '../utils/installerApi.js';
import {
  decorateTimezoneLocation,
  isMappableTimezone,
  normalizeTimezoneLabel,
  timezoneRegionKey,
} from '../utils/nearestTimezone.js';

function resolveSelectionPatch(location) {
  if (!location) {
    return {
      timeZone: '',
      timeZonePin: null,
      timeZoneLatitude: null,
      timeZoneLongitude: null,
      timeZoneCountryCode: '',
    };
  }

  return {
    timeZone: location.timezone,
    timeZonePin: {
      label: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      countryCode: location.countryCode || '',
    },
    timeZoneLatitude: location.latitude,
    timeZoneLongitude: location.longitude,
    timeZoneCountryCode: location.countryCode || '',
  };
}

function mergeTimezoneLocations(timezones, locations) {
  const map = new Map();

  for (const raw of timezoneRegions) {
    const item = decorateTimezoneLocation(raw);
    map.set(item.timezone, item);
  }

  for (const raw of locations) {
    const item = decorateTimezoneLocation(raw);
    if (!item.timezone) continue;
    map.set(item.timezone, {
      ...map.get(item.timezone),
      ...item,
      label: item.label || map.get(item.timezone)?.label || normalizeTimezoneLabel(item.timezone),
      group: item.group || map.get(item.timezone)?.group || timezoneRegionKey(item.timezone),
    });
  }

  for (const timezone of timezones) {
    if (!map.has(timezone)) {
      map.set(timezone, decorateTimezoneLocation({ timezone }));
    }
  }

  return Array.from(map.values()).sort((a, b) => a.timezone.localeCompare(b.timezone));
}

export default function Timezone({ wizard, onChange, validation }) {
  const [timezones, setTimezones] = useState([]);
  const [timezoneLocations, setTimezoneLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fieldErrors = validation?.fieldErrors || {};

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let nextError = '';

      try {
        setLoading(true);
        setError('');

        const [listResult, locationsResult] = await Promise.allSettled([
          installerApi.getTimezones(),
          installerApi.getTimezoneLocations(),
        ]);

        if (cancelled) {
          return;
        }

        const items = listResult.status === 'fulfilled' && Array.isArray(listResult.value?.items)
          ? listResult.value.items
          : [];
        const locations = locationsResult.status === 'fulfilled' && Array.isArray(locationsResult.value?.items)
          ? locationsResult.value.items
          : [];

        setTimezones(items.length > 0 ? items : timezoneRegions.map((item) => item.timezone));
        setTimezoneLocations(locations.length > 0 ? locations : timezoneRegions);

        if (listResult.status !== 'fulfilled' && locationsResult.status !== 'fulfilled') {
          nextError = 'Backend indisponível para timezones. Usando catálogo interno.';
        }
      } finally {
        if (!cancelled) {
          setError(nextError);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedLocations = useMemo(
    () => mergeTimezoneLocations(timezones, timezoneLocations),
    [timezones, timezoneLocations],
  );

  const mappableLocations = useMemo(
    () => mergedLocations.filter(isMappableTimezone),
    [mergedLocations],
  );

  const selectedLocation = useMemo(
    () => mergedLocations.find((item) => item.timezone === wizard.timeZone) || null,
    [mergedLocations, wizard.timeZone],
  );

  useEffect(() => {
    if (!wizard.timeZone || !selectedLocation) return;

    if (
      wizard.timeZoneLatitude !== selectedLocation.latitude
      || wizard.timeZoneLongitude !== selectedLocation.longitude
      || wizard.timeZoneCountryCode !== (selectedLocation.countryCode || '')
      || wizard.timeZonePin?.label !== selectedLocation.label
    ) {
      onChange(resolveSelectionPatch(selectedLocation));
    }
  }, [
    onChange,
    selectedLocation,
    wizard.timeZone,
    wizard.timeZoneCountryCode,
    wizard.timeZoneLatitude,
    wizard.timeZoneLongitude,
    wizard.timeZonePin?.label,
  ]);

  function applyLocation(location) {
    onChange(resolveSelectionPatch(location));
  }

  // Prepara as opções para o KxCombobox
  const timezoneOptions = useMemo(() => {
    return mergedLocations.map(loc => {
      const isBrasil = loc.countryCode === 'BR' || loc.group?.includes('Brasil') || loc.timezone?.includes('Noronha');
      const countrySuffix = isBrasil && !loc.group?.includes('Brasil') ? ', Brasil' : '';
      const displayGroup = loc.group ? `${loc.group}${countrySuffix}` : (loc.countryCode === 'BR' ? 'Brasil' : loc.countryCode);

      return {
        id: loc.timezone,
        label: `${loc.label}${displayGroup ? ` — ${displayGroup}` : ''}`,
        desc: loc.timezone
      };
    });
  }, [mergedLocations]);

  // Sugestões Rápidas (Fusos Comuns)
  const quickSuggestions = useMemo(() => {
    if (!selectedLocation?.countryCode) return [];
    if (selectedLocation.countryCode === 'BR') {
      return [
        'America/Sao_Paulo',
        'America/Cuiaba',
        'America/Manaus',
        'America/Recife',
        'America/Belem'
      ];
    }
    return [];
  }, [selectedLocation?.countryCode]);

  // Data e Hora simulada para o preview local
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = useMemo(() => {
    if (!wizard.timeZone) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: wizard.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(currentTime);
    } catch {
      return '—';
    }
  }, [wizard.timeZone, currentTime]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      {/* 72% Coluna Principal de Configuração */}
      <div className="flex flex-[0.72] flex-col overflow-y-auto pr-2 custom-scrollbar">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Fuso Horário</h2>
          <p className="mt-1 text-[12px] font-medium text-slate-500 dark:text-slate-400">
            Selecione no mapa ou busque sua região.
          </p>
        </div>

        <div className="mb-4">
          <KxCombobox
            options={timezoneOptions}
            value={wizard.timeZone}
            onChange={(id) => {
              const loc = mergedLocations.find(l => l.timezone === id);
              if (loc) applyLocation(loc);
            }}
            placeholder={loading ? 'Carregando timezones...' : 'Buscar cidade ou fuso horário...'}
            searchPlaceholder="Buscar por IANA, cidade..."
            disabled={loading}
            maxItems={8}
          />
          <FieldError message={fieldErrors.timeZone} />
        </div>

        <div className="min-h-[480px] flex-1 rounded-xl overflow-hidden border border-slate-200/50 dark:border-white/10 shadow-sm relative">
          <TimezoneMap
            locations={mappableLocations}
            selectedLocation={selectedLocation}
            value={wizard.timeZone}
            onChange={({ location }) => applyLocation(location)}
          />
        </div>

        {error && (
          <div className="mt-4 text-[11px] font-medium text-warning dark:text-warning">
            <span className="font-bold">Aviso:</span> {error}
          </div>
        )}

        {quickSuggestions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Sugestões:</span>
            {quickSuggestions.map(tz => {
              const tzLoc = mergedLocations.find(l => l.timezone === tz);
              if (!tzLoc) return null;
              return (
                <button
                  key={tz}
                  type="button"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    wizard.timeZone === tz
                      ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue'
                      : 'bg-white/50 border-slate-200/50 text-slate-600 hover:border-slate-300 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20'
                  }`}
                  onClick={() => applyLocation(tzLoc)}
                >
                  {tzLoc.label.split('/')[0]} ({tzLoc.timezone.split('/')[1]?.replace('_', ' ') || tz})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 28% Coluna Lateral de Resumo */}
      <div className="w-full shrink-0 flex-[0.28] flex flex-col justify-start lg:border-l lg:border-slate-200/50 lg:pl-6 lg:dark:border-white/10">
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Fuso Selecionado
            </h3>
            <div className="text-[15px] font-bold text-accent-blue break-all">
              {wizard.timeZone || '—'}
            </div>

            {wizard.timeZone && wizard.timeZone !== 'Etc/UTC' && (
              <button
                type="button"
                className="mt-3 w-max text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors flex items-center gap-1.5"
                onClick={() => applyLocation(decorateTimezoneLocation({
                  timezone: 'Etc/UTC',
                  label: 'UTC',
                  group: 'UTC',
                  latitude: 0,
                  longitude: 0,
                  countryCode: '',
                }))}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Mudar para UTC
              </button>
            )}
          </div>

          <div className="border-t border-slate-200/50 pt-5 dark:border-white/5">
            <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold">Localidade</div>
            <div className="text-[13px] font-semibold text-slate-900 dark:text-white mt-1">
              {selectedLocation?.label ? `${selectedLocation.label} — ${selectedLocation.group}` : '—'}
            </div>
          </div>

          <div className="border-t border-slate-200/50 pt-5 dark:border-white/5">
            <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold">Hora Local Prevista</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
              {formattedTime}
            </div>
          </div>

          <div className="border-t border-slate-200/50 pt-5 dark:border-white/5">
            <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold">UTC Offset</div>
            <div className="text-[13px] font-semibold text-slate-600 dark:text-slate-400 mt-1">
              {(() => {
                if (!wizard.timeZone) return '—';
                try {
                  const date = new Date();
                  const tzString = date.toLocaleString('en-US', { timeZone: wizard.timeZone, timeZoneName: 'longOffset' });
                  const match = tzString.match(/GMT([+-]\d{2}:\d{2})/);
                  if (match) return `UTC ${match[1]}`;
                  if (tzString.includes('GMT')) return 'UTC ±00:00';
                  return '—';
                } catch {
                  return '—';
                }
              })()}
            </div>
          </div>

          {selectedLocation?.latitude !== undefined && selectedLocation?.longitude !== undefined && (
            <div className="border-t border-slate-200/50 pt-5 dark:border-white/5">
              <div className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold">Coordenadas</div>
              <div className="text-[12px] font-medium text-slate-500 dark:text-slate-500 mt-1">
                {Number(selectedLocation.latitude).toFixed(4)}, {Number(selectedLocation.longitude).toFixed(4)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
