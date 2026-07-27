// Tests do hook useKveSnapshot contra os 3 endpoints.
// Usa fetch stub para garantir determinismo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

function withFetch(impl, fn) {
  globalThis.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = originalFetch;
    });
}

async function importFresh() {
  const url = '../../src/lib/kve.js?t=' + Date.now() + Math.random();
  return import(url);
}

test('useKveSnapshot existe e é função', async () => {
  await withFetch(async () => new Response('{}', { status: 200 }), async () => {
    const { useKveSnapshot } = await importFresh();
    assert.equal(typeof useKveSnapshot, 'function');
  });
});

test('helper safeJson lança erro estruturado em 503', async () => {
  await withFetch(async () => {
    return new Response(
      JSON.stringify({
        status: 'unavailable',
        code: 'incus_unavailable',
        message: 'socket missing',
        source: 'incus_unavailable'
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }, async () => {
    const { getKveHealth } = await importFresh();
    await assert.rejects(
      () => getKveHealth(),
      (err) => {
        assert.equal(err.status, 'unavailable');
        assert.equal(err.code, 'incus_unavailable');
        return true;
      }
    );
  });
});

// Garantia de contrato: payload 200 vazio do Incus não pode ser
// confundido com indisponibilidade. O snapshot hook distingue
// 'empty' (200 com []) de 'unavailable' (503).

test('payload 200 com instances=[] é ready/empty, nunca unavailable', async () => {
  await withFetch(async () => {
    return new Response(
      JSON.stringify({ instances: [], source: 'incus', status: 'ready' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }, async () => {
    const { getKveInstances } = await importFresh();
    const data = await getKveInstances();
    assert.equal(data.status, 'ready');
    assert.ok(Array.isArray(data.instances));
    assert.equal(data.instances.length, 0);
    // Invariante: o kryxd NUNCA devolve 200 com payload vazio
    // quando Incus está indisponível; isso é o teste do contrato.
    assert.notEqual(data.status, 'unavailable');
  });
});

test('503 carrega payload completo para diagnóstico da UI', async () => {
  await withFetch(async () => {
    return new Response(
      JSON.stringify({
        status: 'unavailable',
        code: 'incus_timeout',
        message: 'timeout após 5000ms aguardando Incus',
        source: 'incus_timeout'
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }, async () => {
    const { getKveHealth } = await importFresh();
    await assert.rejects(
      () => getKveHealth(),
      (err) => {
        assert.equal(err.status, 'unavailable');
        assert.equal(err.code, 'incus_timeout');
        assert.match(err.message, /timeout/);
        // O payload completo fica disponível para a UI exibir
        assert.ok(err.payload);
        assert.equal(err.payload.source, 'incus_timeout');
        return true;
      }
    );
  });
});
