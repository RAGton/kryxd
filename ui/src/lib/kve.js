//! Cliente HTTP para o slice KVE (Kryonix Virtualization Engine) do kryxd.
//!
//! Endpoints consumidos:
//! - GET /api/v2/kve/health
//! - GET /api/v2/kve/instances
//! - GET /api/v2/kve/storage
//!
//! Estes endpoints foram introduzidos em PR #20 (kryxd) e
//! substituem o stub legado /api/v2/virt/*. Aqui expomos:
//!
//! 1) `getKveHealth` -> estado do backend (ready/unavailable)
//! 2) `getKveInstances` -> instancias reais via Incus unix socket
//! 3) `getKveStorage` -> storage pools reais via Incus
//! 4) um hook `useKveSnapshot` que agrega os tres com estado
//!    explicito (loading/ready/empty/unavailable/error).

import { useEffect, useState } from 'react';

const KVE_BASE = '/api/v2/kve';

async function safeJson(path) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(
      body?.message || `kryxd reportou ${res.status} em ${path}`
    );
    err.code = body?.code || 'incus_unavailable';
    err.status = body?.status || 'unavailable';
    err.payload = body;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${path}`);
  }
  return res.json();
}

export async function getKveHealth() {
  return safeJson(`${KVE_BASE}/health`);
}

export async function getKveInstances() {
  return safeJson(`${KVE_BASE}/instances`);
}

export async function getKveStorage() {
  return safeJson(`${KVE_BASE}/storage`);
}

/**
 * Agrega health/instances/storage em um snapshot unificado com
 * estado explicito para a UI.
 *
 *   loading      -> ainda nao terminou a primeira carga
 *   ready        -> Incus saudavel, dados disponiveis (lista pode ser vazia)
 *   empty        -> Incus saudavel e sem instancias/pools
 *   unavailable  -> Incus indisponivel (503 do kryxd)
 *   error        -> qualquer outro erro (network, parse, 5xx fora do 503)
 */
export function useKveSnapshot({ refreshMs = 0 } = {}) {
  const [state, setState] = useState({
    status: 'loading',
    health: null,
    instances: [],
    storage: [],
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [health, instancesPayload, storagePayload] = await Promise.all([
          getKveHealth(),
          getKveInstances(),
          getKveStorage()
        ]);
        if (cancelled) return;

        const instances = Array.isArray(instancesPayload?.instances)
          ? instancesPayload.instances
          : [];
        const storage = Array.isArray(storagePayload?.storage)
          ? storagePayload.storage
          : [];

        const isEmpty = instances.length === 0 && storage.length === 0;
        setState({
          status: isEmpty ? 'empty' : 'ready',
          health,
          instances,
          storage,
          error: null
        });
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 'unavailable' || err?.code === 'incus_unavailable') {
          setState({
            status: 'unavailable',
            health: null,
            instances: [],
            storage: [],
            error: err
          });
        } else {
          setState({
            status: 'error',
            health: null,
            instances: [],
            storage: [],
            error: err
          });
        }
      }
    }

    load();
    if (refreshMs > 0) {
      const id = setInterval(load, refreshMs);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [refreshMs]);

  return state;
}
