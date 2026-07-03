import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function KxCombobox({
  options = [],
  value = null,
  onChange,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  label,
  disabled = false,
  maxItems = 6
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.id === value);

  const filteredOptions = options.filter((o) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (o.label && o.label.toLowerCase().includes(term)) ||
      (o.id && o.id.toLowerCase().includes(term)) ||
      (o.desc && o.desc.toLowerCase().includes(term))
    );
  });

  const displayOptions = filteredOptions.slice(0, maxItems);

  return (
    <div className="relative flex flex-col gap-1" ref={containerRef}>
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-[13px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent-blue/50 backdrop-blur-md ${
          disabled
            ? 'cursor-not-allowed border-slate-200/50 bg-white/20 text-slate-400 opacity-60 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-500'
            : isOpen
              ? 'border-accent-blue/40 bg-accent-blue/10 text-slate-900 dark:text-white shadow-sm ring-1 ring-accent-blue/20'
              : 'border-white/40 bg-white/30 text-slate-800 hover:border-white/60 hover:bg-white/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/10 shadow-sm'
        }`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-2xl border border-white/40 bg-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#1a1b1e]/80">
          <div className="p-2 border-b border-slate-200/50 dark:border-white/5">
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl bg-white/50 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent-blue/50 dark:bg-black/20 dark:text-slate-200 dark:placeholder-slate-500 border border-transparent focus:border-accent-blue/30 transition-all"
            />
          </div>

          <div className="max-h-[240px] overflow-y-auto p-1">
            {displayOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-slate-500 dark:text-slate-400">
                {t('combobox.no_results', { defaultValue: 'Nenhum resultado encontrado.' })}
              </div>
            ) : (
              displayOptions.map((opt) => {
                const isSelected = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-all ${
                      isSelected
                        ? 'bg-accent-blue/10 text-accent-blue font-semibold dark:bg-accent-blue/20'
                        : 'text-slate-700 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/5 hover:backdrop-blur-md'
                    }`}
                  >
                    <div className="flex flex-col truncate">
                      <span>{opt.label}</span>
                      {opt.desc && (
                        <span className={`text-[11px] mt-0.5 ${isSelected ? 'text-accent-blue/70 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {opt.desc}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <svg className="h-4 w-4 shrink-0 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
            
            {filteredOptions.length > maxItems && (
              <div className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                + {filteredOptions.length - maxItems} {t('combobox.more_results', { defaultValue: 'resultados (refine a busca)' })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
