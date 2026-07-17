import React, { useState } from 'react';
import { motion } from 'motion/react';
import { FileText, Search, Filter, Download, Trash2, Clock, AlertTriangle, CheckCircle2, Info, Terminal, Activity, Zap } from 'lucide-react';
import KveCard from '../components/KveCard';
import { clsx } from 'clsx';

const LogsView: React.FC = () => {
  const [search, setSearch] = useState('');

  const logs = [
    { id: 1, time: '2026-03-18 10:32:45', level: 'info', source: 'auth-service', message: 'Usuário aguiarrocha autenticado via OAuth2', user: 'aguiarrocha' },
    { id: 2, time: '2026-03-18 10:30:12', level: 'warning', source: 'quota-manager', message: 'Quota excedida para o usuário user-rocha (850MB/1000MB)', user: 'system' },
    { id: 3, time: '2026-03-18 10:25:00', level: 'success', source: 'publish-engine', message: 'Geração #142 promovida para produção com sucesso', user: 'aguiarrocha' },
    { id: 4, time: '2026-03-18 10:15:22', level: 'danger', source: 'firewall', message: 'Tentativa de intrusão detectada do IP 185.220.101.42 (Porta 22)', user: 'system' },
    { id: 5, time: '2026-03-18 10:05:10', level: 'info', source: 'user-service', message: 'Novo usuário criado: operator-01', user: 'aguiarrocha' },
    { id: 6, time: '2026-03-18 09:55:30', level: 'warning', source: 'nfs-server', message: 'Latência elevada detectada no volume /export/data', user: 'system' },
    { id: 7, time: '2026-03-18 09:42:15', level: 'info', source: 'node-manager', message: 'Node node-042 autorizado e provisionado', user: 'system' },
    { id: 8, time: '2026-03-18 09:30:00', level: 'success', source: 'backup-service', message: 'Backup diário concluído com sucesso (Snapshot snap-001)', user: 'system' },
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
          <h2 className="text-2xl font-bold text-white tracking-tight">Logs & Auditoria</h2>
          <p className="text-slate-500 text-sm">Trilha de eventos do sistema, segurança e atividades de usuários</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-bold">
            <Download size={18} /> EXPORTAR LOGS
          </button>
          <button className="px-4 py-2 rounded-lg bg-kve-danger/10 border border-kve-danger/20 text-kve-danger font-bold text-sm hover:bg-kve-danger hover:text-white transition-all flex items-center gap-2">
            <Trash2 size={18} /> LIMPAR BUFFER
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input 
            type="text" 
            placeholder="Filtrar por mensagem, usuário ou fonte..." 
            className="w-full bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2.5 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <Filter size={16} /> Nível: Todos
          </button>
          <button className="px-4 py-2.5 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
            <Clock size={16} /> Últimas 24h
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KveCard className="glass-hover">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-kve-accent/10 rounded-lg text-kve-accent">
              <Activity size={16} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Eventos</p>
          </div>
          <p className="text-2xl font-bold text-white">14,204</p>
        </KveCard>
        <KveCard className="glass-hover">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-kve-danger/10 rounded-lg text-kve-danger">
              <AlertTriangle size={16} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Erros Críticos</p>
          </div>
          <p className="text-2xl font-bold text-white">12</p>
        </KveCard>
        <KveCard className="glass-hover">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-kve-warning/10 rounded-lg text-kve-warning">
              <Zap size={16} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Alertas</p>
          </div>
          <p className="text-2xl font-bold text-white">142</p>
        </KveCard>
        <KveCard className="glass-hover">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-kve-success/10 rounded-lg text-kve-success">
              <Terminal size={16} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Audit Trail</p>
          </div>
          <p className="text-2xl font-bold text-white">ACTIVE</p>
        </KveCard>
      </div>

      <KveCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-kve-border bg-slate-900/20">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-48">Data / Hora</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-24">Nível</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-32">Fonte</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mensagem</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-32">Usuário</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kve-border font-mono">
              {logs.filter(l => l.message.toLowerCase().includes(search.toLowerCase()) || l.user.toLowerCase().includes(search.toLowerCase())).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/20 transition-colors group">
                  <td className="px-6 py-4 text-[10px] text-slate-500">
                    {log.time}
                  </td>
                  <td className="px-6 py-4">
                    <div className={clsx(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest text-center",
                      log.level === 'success' ? "bg-kve-success/10 text-kve-success" :
                      log.level === 'warning' ? "bg-kve-warning/10 text-kve-warning" :
                      log.level === 'danger' ? "bg-kve-danger/10 text-kve-danger" :
                      "bg-kve-accent/10 text-kve-accent"
                    )}>
                      {log.level}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                    {log.source}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-300">
                    {log.message}
                  </td>
                  <td className="px-6 py-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                    {log.user}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors">
                      <Info size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </KveCard>
    </motion.div>
  );
};

export default LogsView;
