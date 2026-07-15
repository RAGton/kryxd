export async function getFleetStatus() {
  const res = await fetch('/api/v1/fleet/status');
  if (!res.ok) throw new Error('Failed to fetch fleet status');
  return res.json();
}

export async function getStorageQuotasi() {
  const res = await fetch('/api/v1/storage/quotas');
  if (!res.ok) throw new Error('Failed to fetch storage quotas');
  return res.json();
}

export async function getVirtNodes() {
  const res = await fetch('/api/virt/list');
  if (!res.ok) throw new Error('Failed to fetch virt nodes');
  return res.json();
}
