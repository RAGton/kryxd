import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTopology } from '../hooks/useDiskTopology.js';

/**
 * Testes da função pura `detectTopology` (KCR UI-1).
 *
 * O hook `useDiskTopology` depende de `useMemo` do React e portanto requer
 * contexto React para ser testado completamente. Aqui testamos apenas a
 * lógica de decisão de topologia, que é pura e determinística.
 *
 * Para testes integrados do hook, ver testes de componentes Playwright/E2E.
 */

// ─────────────────────────────────────────────────────────────────────
// detecção automática (storageMode='automatic')
// ─────────────────────────────────────────────────────────────────────

test('detectTopology: 0 discos → single', () => {
  assert.equal(detectTopology(0, 'automatic'), 'single');
});

test('detectTopology: 1 disco → single', () => {
  assert.equal(detectTopology(1, 'automatic'), 'single');
});

test('detectTopology: 2 discos → split', () => {
  assert.equal(detectTopology(2, 'automatic'), 'split');
});

test('detectTopology: 3 discos → raid (detecção)', () => {
  assert.equal(detectTopology(3, 'automatic'), 'raid');
});

test('detectTopology: 4+ discos → raid', () => {
  assert.equal(detectTopology(4, 'automatic'), 'raid');
  assert.equal(detectTopology(8, 'automatic'), 'raid');
});

// ─────────────────────────────────────────────────────────────────────
// overrides manuais
// ─────────────────────────────────────────────────────────────────────

test('detectTopology: storageMode=raid vence qualquer contagem', () => {
  assert.equal(detectTopology(0, 'raid'), 'raid');
  assert.equal(detectTopology(1, 'raid'), 'raid');
  assert.equal(detectTopology(2, 'raid'), 'raid');
  assert.equal(detectTopology(10, 'raid'), 'raid');
});

test('detectTopology: storageMode=manual → unsupported', () => {
  assert.equal(detectTopology(0, 'manual'), 'unsupported');
  assert.equal(detectTopology(2, 'manual'), 'unsupported');
  assert.equal(detectTopology(5, 'manual'), 'unsupported');
});

test('detectTopology: storageMode=lvm → unsupported', () => {
  assert.equal(detectTopology(0, 'lvm'), 'unsupported');
  assert.equal(detectTopology(3, 'lvm'), 'unsupported');
});

test('detectTopology: storageMode inválido cai no default (automatic)', () => {
  // Valores desconhecidos não quebram — fallback para automatic.
  assert.equal(detectTopology(1, 'unknown'), 'single');
  assert.equal(detectTopology(2, ''), 'split');
  assert.equal(detectTopology(3, undefined), 'raid');
});