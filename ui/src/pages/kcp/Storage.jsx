import { useEffect, useState } from 'react';
import { HardDrive, PieChart, Activity, Database, AlertCircle } from 'lucide-react';
import { getStoragePools } from '../../lib/api.js';

function formatBytes(bytesStr) {
  if (!bytesStr || bytesStr === 'none' || bytesStr === '0') return 'N/A';
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes)) return bytesStr;
  
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDriverIcon(driver) {
  switch(driver.toLowerCase()) {
    case 'zfs':
      return <Database size={20} className="text-blue-400" />;
    case 'ceph':
    case 'rbd':
      return <Database size={20} className="text-purple-400" />;
    case 'btrfs':
      return <Database size={20} className="text-green-400" />;
    case 'lvm':
      return <HardDrive size={20} className="text-orange-400" />;
    default:
      return <HardDrive size={20} className="text-gray-400" />;
  }
}

function getDriverBadgeClass(driver) {
  switch(driver.toLowerCase()) {
    case 'zfs':
      return 'bg-blue-900/30 text-blue-300 border-blue-500/30';
    case 'ceph':
    case 'rbd':
      return 'bg-purple-900/30 text-purple-300 border-purple-500/30';
    case 'btrfs':
      return 'bg-green-900/30 text-green-300 border-green-500/30';
    default:
      return 'bg-gray-800 text-gray-300 border-gray-600';
  }
}

function StatusIndicator({ status }) {
  const isHealthy = status === 'Created' || status === 'Running';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
      isHealthy 
        ? 'bg-green-900/30 text-green-300 border-green-500/30' 
        : 'bg-yellow-900/30 text-yellow-300 border-yellow-500/30'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
      {status || 'Unknown'}
    </span>
  );
}

export default function Storage() {
  const [activeTab, setActiveTab] = useState('pools');
  const [pools, setPools] = useState([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [poolsError, setPoolsError] = useState(false);

  // Fetch storage pools
  useEffect(() => {
    if (activeTab === 'pools') {
      setPoolsLoading(true);
      setPoolsError(false);
      getStoragePools()
        .then(data => {
          setPools(Array.isArray(data) ? data : []);
          setPoolsLoading(false);
        })
        .catch(err => {
          console.error(err);
          setPoolsError(true);
          setPoolsLoading(false);
        });
    }
  }, [activeTab]);

  const tabs = [
    { id: 'pools', label: 'Pools', icon: <Database size={18} /> },
    { id: 'volumes', label: 'Volumes', icon: <HardDrive size={18} />, disabled: true },
    { id: 'health', label: 'Health', icon: <Activity size={18} />, disabled: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
          <HardDrive size={24} className="text-kryonix-blue" />
          <h2 className="text-lg font-semibold">Storage Command Center</h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-kryonix-blue text-white'
                : tab.disabled
                ? 'text-gray-500 cursor-not-allowed'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1">
        {activeTab === 'pools' && (
          poolsLoading ? (
            <div className="text-text-muted">Loading pools...</div>
          ) : poolsError ? (
            <div className="text-danger">Error loading storage pools.</div>
          ) : pools.length === 0 ? (
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-10 flex flex-col items-center justify-center text-text-muted shadow-sm gap-4">
              <AlertCircle size={48} className="text-gray-300" />
              <p>No storage pools found. Incus may not have any configured.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pools.map((pool, i) => (
                <div key={pool.name || i} className="bg-bg-elevated border border-border-subtle rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                  {/* Pool Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getDriverIcon(pool.driver)}
                      <span className="font-semibold text-text-primary">{pool.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded border ${getDriverBadgeClass(pool.driver)}`}>
                      {pool.driver.toUpperCase()}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Status</span>
                    <StatusIndicator status={pool.status} />
                  </div>

                  {/* Sizes */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Size</span>
                    <span className="font-mono text-sm text-text-primary">
                      {pool.total_size ? formatBytes(pool.total_size) : 'N/A'}
                    </span>
                  </div>

                  {/* Used */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Used</span>
                    <span className="font-mono text-sm text-text-primary">
                      {pool.used_size ? formatBytes(pool.used_size) : 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'volumes' && (
          <div className="text-text-muted">Volumes tab - coming soon (P3)</div>
        )}

        {activeTab === 'health' && (
          <div className="text-text-muted">Health tab - coming soon (P3)</div>
        )}
      </div>
    </div>
  );
}