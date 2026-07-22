async function requestJson(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Request failed: ${path}`);
  }
  return res.json();
}

export async function loginGateway(credentials) {
  return requestJson('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
}

export async function getSession() {
  return requestJson('/api/v1/auth/session');
}

export async function getSystemIdentity() {
  return requestJson('/api/v1/system/identity');
}

export async function getFleetStatus() {
  return requestJson('/api/v1/fleet/status');
}

export async function getStorageQuotasi() {
  return requestJson('/api/v1/storage/quotas');
}

export async function getStoragePools() {
  return requestJson('/api/v2/storage/pools');
}

export async function getCephStatus() {
  return requestJson('/api/v2/storage/ceph/status');
}

export async function getCephOsds() {
  return requestJson('/api/v2/storage/ceph/osds');
}

export async function getReplicationStatus() {
  return requestJson('/api/v2/storage/replication/status');
}

export async function generateReplicationPlan(data) {
  return requestJson('/api/v2/storage/replication/plan', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function getVirtNodes() {
  return requestJson('/api/v2/virt/nodes');
}

export async function getVirtInstances() {
  return requestJson('/api/v2/virt/instances');
}

export async function getClusterTopology() {
  return requestJson('/api/v2/cluster/topology');
}

export async function createInstance(config) {
  return requestJson('/api/v2/virt/instances', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function createVirtInstance(config) {
  return createInstance(config);
}

export async function changeInstanceState(id, action) {
  return requestJson(`/api/v2/virt/instances/${encodeURIComponent(id)}/state`, {
    method: 'PUT',
    body: JSON.stringify({ action })
  });
}

export async function getHostMetrics() {
  return requestJson('/api/v2/metrics/host');
}
