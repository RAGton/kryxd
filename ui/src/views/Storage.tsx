import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Database, HardDrive, History, ShieldCheck, AlertTriangle, Search, Filter, ArrowUpRight, ArrowDownRight, Layers, FileText, Trash2, RefreshCw, Network } from 'lucide-react';
import KveCard from '../components/KveCard';

const StorageView: React.FC = () => {
  const [search, setSearch] = useState('');

  const snapshots = [
    { id: 'snap-001', date: '2026-03-18 04:00', size: '12.4 GB', type: 'daily', status: 'healthy' },
    { id: 'snap-002', date: '2026-03-17 04:00', size: '11.8 GB', type: 'daily', status: 'healthy' },
    { id: 'snap-003', date: '2026-03-16 04:00', size: '12.1 GB', type: 'daily', status: 'healthy' },
    { id: 'snap-004', date: '2026-03-15 04:00', size: '11.5 GB', type: 'daily', status: 'healthy' },
    { id: 'snap-005', date: '2026-03-14 04:00', size: '12.2 GB', type: 'daily', status: 'healthy' },
  ];

  const exports = [
    { path: '/export/home', clients: 128, options: 'rw,sync,no_root_squash', status: 'active' },
    { path: '/export/nix-store', clients: 128, options: 'ro,async,no_root_squash', status: 'active' },
    { path: '/export/config', clients: 128, options: 'ro,sync,no_root_squash', status: 'active' },
    { path: '/export/data', clients: 42, options: 'rw,sync,no_root_squash', status: 'active' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Storage & NFS Exports</h2>
          <p className="text-slate-500 text-sm">Gerenciamento de volumes BTRFS, snapshots e compartilhamentos de rede</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-bold">
            <RefreshCw size={18} /> RE-EXPORT ALL
          </button>
          <button className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_25px_rgba(56,189,248,0.4)] transition-all flex items-center gap-2">
            <Layers size={18} /> NOVO SNAPSHOT
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KveCard 
          title="Volume Principal (BTRFS)" 
          subtitle="Pool: /dev/sda1" 
          icon={<HardDrive size={16} />}
          className="lg:col-span-2"
        >
          <div className="flex items-center gap-12 p-6 rounded-2xl bg-slate-900/40 border border-kve-border relative overflow-hidden">
            <div className="flex flex-col items-center justify-center w-40 h-40 rounded-full border-8 border-kve-accent/10 bg-kve-accent/5 relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle 
                  cx="50%" cy="50%" r="45%" 
                  className="fill-none stroke-slate-800 stroke-[8px]" 
                />
                <circle 
                  cx="50%" cy="50%" r="45%" 
                  className="fill-none stroke-kve-accent stroke-[8px]" 
                  strokeDasharray="282.7"
                  strokeDashoffset="42.4" // 85%
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center z-10">
                <p className="text-3xl font-black text-white">85%</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Utilizado</p>
              </div>
            </div>
            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total</p>
                  <p className="text-xl font-bold text-white">5.0 TB</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Usado</p>
                  <p className="text-xl font-bold text-white">4.2 TB</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Disponível</p>
                  <p className="text-xl font-bold text-kve-success">0.8 TB</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Snapshots</p>
                  <p className="text-xl font-bold text-white">142 GB</p>
                </div>
              </div>
              <div className="pt-4 border-t border-kve-border flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-kve-success" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RAID 1: HEALTHY</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-kve-success" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">COMPRESSION: ZSTD</span>
                </div>
              </div>
            </div>
          </div>
        </KveCard>

        <KveCard 
          title="Alertas de Storage" 
          subtitle="Monitoramento Ativo" 
          icon={<AlertTriangle size={16} />}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-kve-warning/10 border border-kve-warning/20">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="text-kve-warning" size={18} />
                <p className="text-xs font-bold text-kve-warning uppercase tracking-widest">Quota Crítica</p>
              </div>
              <p className="text-xs text-slate-300">Usuário <strong className="text-white">aguiarrocha</strong> atingiu 85% da quota alocada.</p>
            </div>
            <div className="p-4 rounded-xl bg-kve-success/10 border border-kve-success/20">
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="text-kve-success" size={18} />
                <p className="text-xs font-bold text-kve-success uppercase tracking-widest">Check de Integridade</p>
              </div>
              <p className="text-xs text-slate-300">Último scrub concluído em 18/03/2026 sem erros detectados.</p>
            </div>
          </div>
        </KveCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KveCard title="NFS Exports" icon={<Network size={16} />} noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-kve-border bg-slate-900/20">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Caminho</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Clientes</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Opções</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kve-border">
                {exports.map((exp) => (
                  <tr key={exp.path} className="hover:bg-slate-800/20 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Database className="text-kve-accent" size={16} />
                        <span className="text-sm font-mono text-white">{exp.path}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-300">{exp.clients} Nodes</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono text-slate-500">{exp.options}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors">
                        <FileText size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </KveCard>

        <KveCard title="Snapshots Recentes" icon={<History size={16} />} noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-kve-border bg-slate-900/20">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">ID</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data / Hora</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tamanho</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kve-border">
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-800/20 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-kve-accent uppercase tracking-widest">{snap.id}</span>
                    </td>
                    <td className="px-6 py-4 text-[10px] font-mono text-slate-400">
                      {snap.date}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-slate-300">{snap.size}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Restore">
                          <RefreshCw size={14} />
                        </button>
                        <button className="p-1.5 rounded bg-kve-danger/10 text-kve-danger hover:bg-kve-danger hover:text-white transition-all" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </KveCard>
      </div>
    </motion.div>
  );
};

export default StorageView;
