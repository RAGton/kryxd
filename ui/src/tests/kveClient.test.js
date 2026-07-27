// @vitest-environment node
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub global fetch antes de importar o módulo (módulo captura nada
// no escopo global, mas isso garante determinismo).
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
  // Re-import com cache bust via query string
  const url = '../../src/lib/kve.js?t=' + Date.now();
  return import(url);
}

test('getKveHealth devolve payload 200 do kryxd', async () => {
  await withFetch(async (url) => {
    assert.equal(url, '/api/v2/kve/health');
    return new Response(
      JSON.stringify({ status: 'ready', source: 'incus', socket: '/var/lib/incus/unix.socket' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }, async () => {
    const { getKveHealth } = await importFresh();
    const result = await getKveHealth();
    assert.equal(result.status, 'ready');
    assert.equal(result.source, 'incus');
    assert.equal(result.socket, '/var/lib/incus/unix.socket');
  });
});

test('getKveInstances devolve array mesmo quando vazio', async () => {
  await withFetch(async (url) => {
    assert.equal(url, '/api/v2/kve/instances');
    return new Response(
      JSON.stringify({ instances: [], source: 'incus', status: 'ready' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }, async () => {
    const { getKveInstances } = await importFresh();
    const result = await getKveInstances();
    assert.ok(Array.isArray(result.instances));
    assert.equal(result.instances.length, 0);
  });
});

test('getKveStorage devolve pool real do Incus', async () => {
  await withFetch(async (url) => {
    assert.equal(url, '/api/v2/kve/storage');
    return new Response(
      JSON.stringify({
        storage: [
          {
            name: 'kryonix-incus',
            driver: 'dir',
            state: 'inuse',
            description: '',
            used_bytes: null,
            total_bytes: null
          }
        ],
        source: 'incus',
        status: 'ready'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }, async () => {
    const { getKveStorage } = await importFresh();
    const result = await getKveStorage();
    assert.equal(result.storage.length, 1);
    assert.equal(result.storage[0].name, 'kryonix-incus');
    assert.equal(result.storage[0].driver, 'dir');
  });
});

test('503 do kryxd vira Error com code incus_unavailable', async () => {
  await withFetch(async () => {
    return new Response(
      JSON.stringify({
        status: 'unavailable',
        code: 'incus_unavailable',
        message: 'socket ausente',
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
        assert.match(err.message, /socket/);
        return true;
      }
    );
  });
});

test('500 fora do 503 vira Error generico', async () => {
  await withFetch(async () => {
    return new Response('boom', { status: 500, headers: {} });
  }, async () => {
    const { getKveHealth } = await importFresh();
    await assert.rejects(
      () => getKveHealth(),
      (err) => {
        assert.match(err.message, /500/);
        assert.equal(err.code, undefined);
        return true;
      }
    );
  });
});
