import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Network, Shield, ShieldAlert, ShieldCheck, Globe, Lock, Unlock, Search, Filter, Plus, Trash2, Edit2, Activity, Zap, ArrowRight } from 'lucide-react';
import KveCard from '../components/KveCard';

const GatewayView: React.FC = () => {
  const [search, setSearch] = useState('');

  const rules = [
    { id: 1, name: 'Allow HTTP/HTTPS', port: '80, 443', protocol: 'TCP', action: 'allow', source: 'ANY', status: 'active' },
    { id: 2, name: 'Allow SSH (Internal)', port: '22', protocol: 'TCP', action: 'allow', source: '10.0.0.0/24', status: 'active' },
    { id: 3, name: 'Block Malicious IP', port: 'ANY', protocol: 'ANY', action: 'deny', source: '185.220.101.0/24', status: 'active' },
    { id: 4, name: 'Allow TFTP Boot', port: '69', protocol: 'UDP', action: 'allow', source: '10.0.0.0/24', status: 'active' },
    { id: 5, name: 'Allow NFS', port: '2049', protocol: 'TCP/UDP', action: 'allow', source: '10.0.0.0/24', status: 'active' },
  ];

  const activeConnections = [
    { id: 'conn-1', source: '10.0.0.42', destination: '8.8.8.8', port: '53 (DNS)', duration: '12m', traffic: '1.2 MB' },
    { id: 'conn-2', source: '10.0.0.15', destination: '10.0.0.1', port: '2049 (NFS)', duration: '4h 32m', traffic: '42.5 GB' },
    { id: 'conn-3', source: '10.0.0.101', destination: 'github.com', port: '443 (HTTPS)', duration: '5m', traffic: '850 KB' },
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
          <h2 className="text-2xl font-bold text-white tracking-tight">Gateway & Firewall</h2>
          <p className="text-slate-500 text-sm">Controle de tráfego, regras de segurança e roteamento de rede</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-lg bg-kve-danger/10 border border-kve-danger/20 text-kve-danger font-bold text-sm hover:bg-kve-danger hover:text-white transition-all flex items-center gap-2">
            <ShieldAlert size={18} /> PANIC MODE (DROP ALL)
          </button>
          <button className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_25px_rgba(56,189,248,0.4)] transition-all flex items-center gap-2">
            <Plus size={18} /> NOVA REGRA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-kve-success/10 rounded-xl text-kve-success">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status Firewall</p>
              <p className="text-2xl font-bold text-white">PROTEGIDO</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">NFTables ativo com 42 regras carregadas.</p>
        </KveCard>

        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-kve-accent/10 rounded-xl text-kve-accent">
              <Globe size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tráfego WAN</p>
              <p className="text-2xl font-bold text-white">12.4 Mbps</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span className="text-kve-success">↑ 2.1 Mbps</span>
            <span className="text-kve-indigo">↓ 10.3 Mbps</span>
          </div>
        </KveCard>

        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-kve-warning/10 rounded-xl text-kve-warning">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Conexões Ativas</p>
              <p className="text-2xl font-bold text-white">1,420</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Pico de 2,100 conexões nas últimas 24h.</p>
        </KveCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KveCard title="Regras de Firewall" icon={<Shield size={16} />} className="lg:col-span-2" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-kve-border bg-slate-900/20">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome / Descrição</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Porta / Prot</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Origem</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ação</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kve-border">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-800/20 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-white">{rule.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono text-slate-400">{rule.port} ({rule.protocol})</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono text-slate-500">{rule.source}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {rule.action === 'allow' ? <Lock className="text-kve-success" size={12} /> : <Unlock className="text-kve-danger" size={12} />}
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${rule.action === 'allow' ? 'text-kve-success' : 'text-kve-danger'}`}>
                          {rule.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button className="p-1.5 rounded bg-kve-danger/10 text-kve-danger hover:bg-kve-danger hover:text-white transition-all">
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

        <KveCard title="Conexões em Tempo Real" icon={<Zap size={16} />}>
          <div className="space-y-4">
            {activeConnections.map((conn) => (
              <div key={conn.id} className="p-4 rounded-xl bg-slate-900/40 border border-kve-border group hover:border-kve-accent/30 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-kve-accent animate-pulse" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">{conn.source}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{conn.duration}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                  <ArrowRight size={12} />
                  <span className="text-white font-bold">{conn.destination}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-600 uppercase">{conn.port}</span>
                  <span className="text-[10px] font-bold text-kve-accent">{conn.traffic}</span>
                </div>
              </div>
            ))}
            <button className="w-full py-2 rounded-lg border border-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 hover:text-white transition-all">
              Ver Todas as Conexões
            </button>
          </div>
        </KveCard>
      </div>
    </motion.div>
  );
};

export default GatewayView;
