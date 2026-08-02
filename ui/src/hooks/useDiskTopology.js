import { useMemo } from 'react';
import {
  computeStorageValidation,
  normalizeDiskInventory,
} from '../utils/storagePlanner.js';

/**
 * Função pura de inferência de topologia.
 *
 * Detecta a topologia com base no número de discos elegíveis, respeitando
 * overrides manuais via `storageMode`.
 *
 * Regras:
 *   - storageMode='raid'    → 'raid'
 *   - storageMode='manual'  → 'unsupported' (não implementado em V2)
 *   - storageMode='lvm'     → 'unsupported' (não implementado em V2)
 *   - storageMode='automatic' (default):
 *       0 ou 1 disco elegível → 'single'
 *       2 discos elegíveis   → 'split'
 *       ≥ 3 discos elegíveis  → 'raid' (sugestão)
 *
 * @param {number} eligibleCount
 * @param {string} storageMode
 * @returns {'single' | 'split' | 'raid' | 'unsupported'}
 */
export function detectTopology(eligibleCount, storageMode = 'automatic') {
  if (storageMode === 'raid') return 'raid';
  if (storageMode === 'manual') return 'unsupported';
  if (storageMode === 'lvm') return 'unsupported';
  if (eligibleCount >= 3) return 'raid';
  if (eligibleCount === 2) return 'split';
  return 'single';
}

/**
 * Hook canônico de decisão de topologia de discos (RAGOS legacy + KCR UI-1).
 *
 * Wrapper React sobre `detectTopology` que integra com o estado do wizard,
 * computa validação via `computeStorageValidation`, e retorna um objeto
 * consolidado para uso em `Disks.jsx`.
 *
 * @param {object} wizard - Estado global do wizard.
 * @param {Array} diskInventory - Inventário bruto de discos (do backend).
 * @returns {{
 *   profile: 'single' | 'split' | 'raid' | 'unsupported',
 *   detectedProfile: 'single' | 'split' | 'raid',
 *   isManualOverride: boolean,
 *   eligibleDisks: Array,
 *   eligibleCount: number,
 *   selectedDisks: Array,
 *   sysDisk: string,
 *   dataDisk: string,
 *   validation: { valid: boolean, blockingReasons: string[], warnings: string[] },
 *   canSubmit: boolean,
 *   blockingReasons: string[],
 *   warnings: string[],
 * }}
 */
export function useDiskTopology(wizard, diskInventory) {
  const storageMode = String(wizard?.storageMode ?? 'automatic');
  const isManualOverride =
    storageMode === 'raid' || storageMode === 'manual' || storageMode === 'lvm';

  // Inventário normalizado (canonical) e apenas os elegíveis
  const inventory = useMemo(
    () => normalizeDiskInventory(Array.isArray(diskInventory) ? diskInventory : []),
    [diskInventory]
  );

  const eligibleDisks = useMemo(
    () => inventory.filter((disk) => disk.eligible !== false),
    [inventory]
  );

  const eligibleCount = eligibleDisks.length;

  // Detecção automática baseada na contagem (RAGOS legacy)
  const detectedProfile = detectTopology(eligibleCount, 'automatic');

  // Profile efetivo: overrides manuais vencem a detecção
  const profile = detectTopology(eligibleCount, storageMode);

  // Discos selecionados: pode vir de `selectedDisks` ou derivado de sysDisk/dataDisk
  const sysDisk = String(wizard?.sysDisk ?? '');
  const dataDisk = String(wizard?.dataDisk ?? '');

  const selectedDisks = useMemo(() => {
    const explicit = Array.isArray(wizard?.selectedDisks) ? wizard.selectedDisks : [];
    if (explicit.length > 0) return explicit;
    if (profile === 'split' && sysDisk && dataDisk) {
      return Array.from(new Set([sysDisk, dataDisk]));
    }
    return sysDisk ? [sysDisk] : [];
  }, [wizard?.selectedDisks, profile, sysDisk, dataDisk]);

  // Validação canônica via computeStorageValidation
  const validation = useMemo(() => {
    if (profile === 'unsupported') {
      return {
        valid: false,
        blockingReasons: [`Topologia '${storageMode}' ainda não é suportada no InstallPlanV2.`],
        warnings: [],
      };
    }
    const result = computeStorageValidation(
      profile,
      inventory,
      sysDisk,
      dataDisk,
      selectedDisks,
      String(wizard?.raidLevel ?? 'raid1')
    );
    return {
      valid: Boolean(result?.valid),
      blockingReasons: Array.isArray(result?.blockingReasons) ? result.blockingReasons : [],
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    };
  }, [profile, storageMode, inventory, sysDisk, dataDisk, selectedDisks, wizard?.raidLevel]);

  return {
    profile,
    detectedProfile,
    isManualOverride,
    eligibleDisks,
    eligibleCount,
    selectedDisks,
    sysDisk,
    dataDisk,
    validation,
    canSubmit: validation.valid && profile !== 'unsupported',
    blockingReasons: validation.blockingReasons,
    warnings: validation.warnings,
  };
}