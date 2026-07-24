import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHostCapabilities } from '../lib/api.js';

const registry = {
  capabilities: [
    { id: 'virtualization.libvirt', status: 'partial' },
    { id: 'virtualization.podman', status: 'ready' },
  ],
};

test('workstation não recebe menus administrativos por fallback de role', () => {
  const capabilities = resolveHostCapabilities(registry, 'Desktop');

  assert.equal(capabilities.server, false);
  assert.equal(capabilities.kcp, false);
  assert.equal(capabilities.kve, false);
});

test('Core recebe KCP e KVE quando o registry declara virtualização ativa', () => {
  const capabilities = resolveHostCapabilities(registry, 'Core');

  assert.equal(capabilities.server, true);
  assert.equal(capabilities.kcp, true);
  assert.equal(capabilities.kve, true);
});

test('flags explícitas false/unsupported vencem o fallback do role', () => {
  const capabilities = resolveHostCapabilities({
    ...registry,
    hostCapabilities: {
      server: false,
      kcp: { status: 'unsupported' },
      kve: false,
    },
  }, 'ThinkServer');

  assert.equal(capabilities.server, false);
  assert.equal(capabilities.kcp, false);
  assert.equal(capabilities.kve, false);
});
