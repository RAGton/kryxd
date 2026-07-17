import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Database, Users, AlertTriangle, Search, Filter, ArrowUpRight, ArrowDownRight, HardDrive, ShieldCheck } from 'lucide-react';
import KveCard from '../components/KveCard';
import { User } from '../types';

const mockQuotas: User[] = [
  { id: '1', username: 'aguiarrocha', email: 'aguiarrocha36@gmail.com', role: 'admin', status: 'active', quotaUsed: 850, quotaLimit: 1000, lastActivity: '2026-03-18 10:00' },
  { id: '2', username: 'operator-01', email: 'op1@kve.io', role: 'operator', status: 'active', quotaUsed: 420, quotaLimit: 500, lastActivity: '2026-03-18 09:45' },
  { id: '3', username: 'user-alpha', email: 'alpha@kve.io', role: 'user', status: 'active', quotaUsed: 180, quotaLimit: 200, lastActivity: '2026-03-17 22:10' },
  { id: '4', username: 'user-beta', email: 'beta@kve.io', role: 'user', status: 'blocked', quotaUsed: 495, quotaLimit: 500, lastActivity: '2026-03-16 14:30' },
  { id: '5', username: 'dev-team', email: 'dev@kve.io', role: 'operator', status: 'active', quotaUsed: 1200, quotaLimit: 2000, lastActivity: '2026-03-18 10:15' },
];

const QuotasView: React.FC = () => {
  const [search, setSearch] = useState('');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Gestão de Quotas</h2>
          <p className="text-slate-500 text-sm">Monitoramento de armazenamento por usuário (NFS/BTRFS)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Buscar usuário..." 
              className="bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="p-2 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-colors">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-kve-accent/10 rounded-xl text-kve-accent">
              <HardDrive size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Alocado</p>
              <p className="text-2xl font-bold text-white">4.2 TB</p>
            </div>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-kve-accent h-full w-[85%] shadow-[0_0_10px_rgba(56,189,248,0.5)]" />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 text-right">85% DA CAPACIDADE TOTAL</p>
        </KveCard>

        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-kve-warning/10 rounded-xl text-kve-warning">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Alertas de Quota</p>
              <p className="text-2xl font-bold text-white">12</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Usuários acima de 90% do limite estabelecido.</p>
        </KveCard>

        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-kve-success/10 rounded-xl text-kve-success">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Integridade NFS</p>
              <p className="text-2xl font-bold text-white">ÓTIMA</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Sincronização ativa e snapshots BTRFS íntegros.</p>
        </KveCard>
      </div>

      <KveCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-kve-border bg-slate-900/20">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Uso de Quota</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Última Sincronia</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kve-border">
              {mockQuotas.map((user) => {
                const percentage = (user.quotaUsed / user.quotaLimit) * 100;
                return (
                  <tr key={user.id} className="hover:bg-slate-800/20 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-kve-accent">
                          {user.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{user.username}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-48">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono text-slate-400">{user.quotaUsed} MB / {user.quotaLimit} MB</span>
                          <span className={`text-[10px] font-bold ${percentage > 90 ? 'text-kve-danger' : percentage > 70 ? 'text-kve-warning' : 'text-kve-success'}`}>
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${percentage > 90 ? 'bg-kve-danger' : percentage > 70 ? 'bg-kve-warning' : 'bg-kve-accent'}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${user.status === 'active' ? 'bg-kve-success/10 text-kve-success' : 'bg-kve-danger/10 text-kve-danger'}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[10px] font-mono text-slate-500">
                      {user.lastActivity}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-[10px] font-bold text-kve-accent hover:underline uppercase tracking-widest">Ajustar Limite</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </KveCard>
    </motion.div>
  );
};

export default QuotasView;
