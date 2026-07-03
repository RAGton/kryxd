import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PRESETS,
  buildCurrentBlocks,
  buildProposedLayout,
  validateProposedLayout,
  toDiskoPartitions,
  formatBytes,
} from '../utils/layoutAssistant.js';

// Cor de cada bloco da barra → token CSS (sem hex hardcoded).
const BLOCK_COLOR = {
  new: 'var(--primary)',        // nova partição Kryonix (root)
  boot: 'var(--secondary)',     // ESP/boot
  free: 'var(--space-blue)',    // espaço livre
  existing: 'var(--disk-existing)', // partições já existentes
};

function Bar({ title, blocks }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</div>
      <div className="flex h-9 w-full overflow-hidden rounded-lg border border-slate-700/60 bg-white/5 backdrop-blur-md">
        {blocks.length === 0 ? (
          <div className="flex w-full items-center justify-center text-xs text-slate-500">—</div>
        ) : (
          blocks.map((b, i) => (
            <div
              key={`${b.kind}-${i}`}
              className="flex items-center justify-center overflow-hidden border-r border-black/30 text-[10px] font-medium text-black/80 transition-all last:border-r-0"
              style={{ flexGrow: Math.max(b.percent, 0.5), flexBasis: 0, background: BLOCK_COLOR[b.kind] || 'var(--disk-existing)' }}
              title={`${b.label}${b.detail ? ` (${b.detail})` : ''} — ${b.sizeLabel}`}
            >
              {b.percent >= 8 ? <span className="truncate px-1">{b.label} · {b.sizeLabel}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * DiskVisualizer — barra proporcional Atual vs Proposto + assistente de presets.
 *
 * Props:
 *  - disk: { path, name, model, sizeBytes, partitions? }
 *  - onApply(diskoPartitions, layout): chamado SÓ após confirmação (se destrutivo)
 *  - onOpenManual(): abre a edição detalhada
 */
export default function DiskVisualizer({ disk, onApply, onOpenManual }) {
  const { t } = useTranslation();
  const [presetId, setPresetId] = useState(null);
  const [pendingDestructive, setPendingDestructive] = useState(null);

  const total = Number(disk?.sizeBytes ?? disk?.size_bytes ?? 0);
  const currentBlocks = useMemo(() => buildCurrentBlocks(disk), [disk]);
  const proposed = useMemo(
    () => (presetId && presetId !== 'manual' ? buildProposedLayout(disk, presetId) : null),
    [disk, presetId],
  );
  const validation = useMemo(() => (proposed ? validateProposedLayout(proposed) : null), [proposed]);

  function selectPreset(preset) {
    if (preset.id === 'manual') {
      setPresetId('manual');
      onOpenManual?.();
      return;
    }
    setPresetId(preset.id);
  }

  function requestApply() {
    if (!proposed || !validation?.valid) return;
    const preset = PRESETS.find((p) => p.id === presetId);
    // Constraint: SEMPRE pedir confirmação destrutiva via modal.
    if (preset?.destructive) {
      setPendingDestructive(proposed);
      return;
    }
    onApply?.(toDiskoPartitions(proposed), proposed);
  }

  function confirmDestructive() {
    onApply?.(toDiskoPartitions(pendingDestructive), pendingDestructive);
    setPendingDestructive(null);
  }

  return (
    <section className="rounded-2xl border border-slate-700/50 bg-white/5 backdrop-blur-md p-5">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-100">{disk?.model || disk?.name || disk?.path || t('disk_visualizer.disk_default_name', { defaultValue: 'Disco' })}</h3>
          <div className="text-xs text-slate-500">{disk?.path} · {formatBytes(total)}</div>
        </div>
      </header>

      <Bar title={t('disk_visualizer.current', { defaultValue: 'Atual' })} blocks={currentBlocks} />
      <Bar title={t('disk_visualizer.proposed', { defaultValue: 'Proposto' })} blocks={proposed?.blocks ?? []} />

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => selectPreset(preset)}
            title={preset.hint}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              presetId === preset.id
                ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                : 'border-slate-700/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            {preset.label}
            {preset.destructive ? <span className="ml-1 text-rose-300/80">⚠</span> : null}
          </button>
        ))}
      </div>

      {validation && !validation.valid ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs text-rose-200">
          {validation.blockingReasons.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      ) : null}

      <button
        type="button"
        disabled={!validation?.valid}
        onClick={requestApply}
        className="mt-4 rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('disk_visualizer.apply_layout', { defaultValue: 'Aplicar layout' })}
      </button>

      {pendingDestructive ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-rose-400/40 bg-white/5 backdrop-blur-md p-6">
            <h4 className="text-lg font-bold text-rose-200">{t('disk_visualizer.confirm_destructive', { defaultValue: 'Confirmar operação destrutiva' })}</h4>
            <p className="mt-2 text-sm text-slate-300">
              {t('disk_visualizer.preset_will_erase_1', { defaultValue: 'O preset ' })}<strong>{PRESETS.find((p) => p.id === presetId)?.label}</strong>{t('disk_visualizer.preset_will_erase_2', { defaultValue: ' vai ' })}
              <strong className="text-rose-300"> {t('disk_visualizer.erase_all_data', { defaultValue: 'apagar todos os dados' })}</strong> {t('disk_visualizer.of_disk', { defaultValue: 'de ' })}{disk?.path}. {t('disk_visualizer.irreversible', { defaultValue: 'Esta ação é irreversível.' })}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setPendingDestructive(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300">{t('disk_visualizer.cancel', { defaultValue: 'Cancelar' })}</button>
              <button type="button" onClick={confirmDestructive}
                className="rounded-lg border border-rose-400/60 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100">
                {t('disk_visualizer.erase_and_apply', { defaultValue: 'Apagar e aplicar' })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
