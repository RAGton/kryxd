import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';

function segmentTitle(value, fallback) {
  if (!value) return fallback;
  return decodeURIComponent(value).replaceAll('-', ' ');
}

const TAB_LABELS = {
  summary: 'Summary',
  cluster: 'Cluster',
  storage: 'Storage',
  firewall: 'Firewall',
  shell: 'Shell',
  network: 'Network',
  disks: 'Disks',
  console: 'Console',
  hardware: 'Hardware',
  snapshots: 'Snapshots',
  volumes: 'Volumes',
  replication: 'Replication',
};

function contextFromRoute(pathname, params) {
  if (pathname.includes('/datacenter/')) {
    return {
      type: 'Datacenter',
      title: 'Datacenter',
      subtitle: 'Cluster-wide KVE control plane',
      tabs: ['summary', 'cluster', 'storage', 'firewall'],
      base: '/kcp/datacenter',
    };
  }

  if (pathname.includes('/vm/') || params.vmId) {
    return {
      type: 'Virtual Machine',
      title: `${params.vmId} (web-server)`,
      subtitle: `Node ${params.nodeId}`,
      tabs: ['summary', 'console', 'hardware', 'snapshots'],
      base: `/kcp/node/${params.nodeId}/vm/${params.vmId}`,
    };
  }

  if (pathname.includes('/ct/') || params.ctId) {
    return {
      type: 'Container',
      title: `${params.ctId} (db-postgres)`,
      subtitle: `Node ${params.nodeId}`,
      tabs: ['summary', 'console', 'hardware', 'snapshots'],
      base: `/kcp/node/${params.nodeId}/ct/${params.ctId}`,
    };
  }

  if (pathname.includes('/storage/') || params.poolId) {
    return {
      type: 'Storage Pool',
      title: segmentTitle(params.poolId, 'Storage'),
      subtitle: `Node ${params.nodeId}`,
      tabs: ['summary', 'volumes', 'replication'],
      base: `/kcp/node/${params.nodeId}/storage/${params.poolId}`,
    };
  }

  return {
    type: 'Node',
    title: segmentTitle(params.nodeId, 'Node'),
    subtitle: 'Host context',
    tabs: ['summary', 'shell', 'network', 'disks'],
    base: `/kcp/node/${params.nodeId}`,
  };
}

export default function ContextLayout() {
  const params = useParams();
  const location = useLocation();
  const context = contextFromRoute(location.pathname, params);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#0a0a0a] text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950 px-6 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-400">{context.type}</p>
            <h1 className="mt-1 text-2xl font-black text-white">{context.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{context.subtitle}</p>
          </div>
          <code className="rounded-lg border border-slate-800 bg-black/40 px-3 py-2 text-xs text-slate-500">
            {location.pathname}
          </code>
        </div>

        <nav className="flex gap-6 overflow-x-auto">
          {context.tabs.map((tab) => (
            <NavLink
              key={tab}
              to={`${context.base}/${tab}`}
              className={({ isActive }) => `border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {TAB_LABELS[tab] || tab}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-[#0a0a0a] p-6">
        <Outlet />
      </div>
    </section>
  );
}
