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

export async function getCapabilities() {
  return requestJson('/api/v2/capabilities');
}

const SERVER_ROLES = new Set(['Core', 'ThinkServer', 'Node']);
const CLUSTER_ROLES = new Set(['Core', 'ThinkServer']);
const ACTIVE_CAPABILITY_STATUSES = new Set(['ready', 'partial']);

function explicitCapabilityFlag(payload, names) {
  const containers = [payload?.hostCapabilities, payload?.capabilityFlags, payload?.flags]
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value));

  for (const container of containers) {
    for (const name of names) {
      const value = container[name];
      if (typeof value === 'boolean') return value;
      if (value && typeof value === 'object') {
        if (typeof value.enabled === 'boolean') return value.enabled;
        if (typeof value.status === 'string') {
          return ACTIVE_CAPABILITY_STATUSES.has(value.status.toLowerCase());
        }
      }
    }
  }

  return undefined;
}

function registrySupports(registry, ids) {
  if (!Array.isArray(registry?.capabilities)) return false;
  return ids.some((id) => {
    const capability = registry.capabilities.find((item) => item?.id === id);
    return ACTIVE_CAPABILITY_STATUSES.has(String(capability?.status || '').toLowerCase());
  });
}

export function resolveHostCapabilities(registry, role) {
  const isServer = SERVER_ROLES.has(role);
  const isCluster = CLUSTER_ROLES.has(role);
  const explicitServer = explicitCapabilityFlag(registry, ['server', 'node', 'cluster']);
  const explicitKcp = explicitCapabilityFlag(registry, ['kcp', 'cluster', 'datacenter']);
  const explicitKve = explicitCapabilityFlag(registry, ['kve', 'incus', 'virtualization']);

  return {
    registry: registry || null,
    server: explicitServer ?? isServer,
    node: explicitCapabilityFlag(registry, ['node']) ?? role === 'Node',
    cluster: explicitCapabilityFlag(registry, ['cluster', 'datacenter']) ?? isCluster,
    kcp: explicitKcp ?? isServer,
    kve: explicitKve ?? (isServer && registrySupports(registry, ['virtualization.libvirt', 'virtualization.podman'])),
  };
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

export async function getHostDetails() {
  return requestJson('/api/v2/system/details');
}

export async function getHostMetrics() {
  return requestJson('/api/v2/metrics/host');
}
