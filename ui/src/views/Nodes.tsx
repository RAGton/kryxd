import React, { useState, useEffect } from 'react';
import { 
  Monitor, 
  Search, 
  Filter, 
  RefreshCw, 
  Power, 
  Terminal, 
  ShieldCheck,
  MoreVertical,
  AlertCircle,
  Cpu,
  RotateCw,
  Eye
} from 'lucide-react';
import { motion } from 'motion/react';
import KveCard from '../components/KveCard';
import Modal from '../components/Modal';
import { Node } from '../types';

const NodesView: React.FC = () => {
  const [nodesList, setNodesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAuthAllModalOpen, setIsAuthAllModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchNodes = async () => {
    try {
      const res = await fetch('/api/nodes');
      if (res.ok) {
        const data = await res.json();
        setNodesList(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, []);

  const handleScan = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/nodes/scan', { method: 'POST' });
      if (res.ok) {
        await fetchNodes();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAuthorize = async (nodeId: string) => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/authorize`, { method: 'POST' });
      if (res.ok) {
        await fetchNodes();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAuthorizeAll = async () => {
    try {
      const res = await fetch('/api/nodes/authorize-all', { method: 'POST' });
      if (res.ok) {
        await fetchNodes();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuthAllModalOpen(false);
    }
  };

  const handleNodeAction = async (nodeId: string, action: 'reboot' | 'shutdown') => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        await fetchNodes();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredNodes = nodesList.filter(node => 
    node.hostname.toLowerCase().includes(search.toLowerCase()) || 
    node.ip.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 font-mono text-xs uppercase animate-pulse">
        <Cpu className="mx-auto mb-4 animate-spin text-kve-accent" size={24} />
        Carregando Topologia dos Nodes no Cluster NixOS...
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Node Search & Scan Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Filtrar nodes..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-kve-accent/50 w-64 transition-all"
            />
          </div>
          <button className="p-2 rounded-lg border border-kve-border hover:bg-slate-800 transition-colors text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium">
            <Filter size={16} /> Filtros
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleScan}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-kve-border hover:bg-slate-800 transition-colors text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin text-kve-accent" : ""} /> 
            {isRefreshing ? 'Scanning...' : 'Scan Network'}
          </button>
          <button 
            onClick={() => setIsAuthAllModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm shadow-[0_0_15px_rgba(56,189,248,0.2)] hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all flex items-center gap-2"
          >
            <ShieldCheck size={18} /> AUTHORIZE ALL
          </button>
        </div>
      </div>

      {/* Nodes List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredNodes.map((node) => (
          <KveCard 
            key={node.id} 
            className="glass-hover group"
            headerActions={
              <button className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors">
                <MoreVertical size={16} />
              </button>
            }
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    node.status === 'online' ? "bg-kve-success/10 text-kve-success" : "bg-slate-800 text-slate-500"
                  }`}>
                    <Monitor size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight">{node.hostname}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">{node.ip}</p>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${
                  node.status === 'online' ? "bg-kve-success shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-700"
                }`} />
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                  <span className="text-slate-500">Geração</span>
                  <span className="text-kve-accent font-mono">{node.generation}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                  <span className="text-slate-500">Uptime</span>
                  <span className="text-slate-300 font-mono">{node.uptime}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                  <span className="text-slate-500">MAC</span>
                  <span className="text-slate-500 font-mono">{node.mac}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                  <span className="text-slate-500">Cluster Status</span>
                  <span className={node.authorized ? "text-kve-success" : "text-kve-danger font-black animate-pulse"}>
                    {node.authorized ? "AUTORIZADO" : "PENDENTE DE LIGAÇÃO"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-auto">
                {!node.authorized && (
                  <button 
                    onClick={() => handleAuthorize(node.id)}
                    className="w-full py-1.5 bg-kve-success/20 text-kve-success rounded hover:bg-kve-success hover:text-black transition-all text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck size={12} /> Autorizar Conexão
                  </button>
                )}
                
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => handleAuthorize(node.id)} // Simulated terminal console open request triggers authentication
                    className="p-2 rounded-lg bg-slate-800 hover:bg-kve-accent/20 hover:text-kve-accent transition-all flex items-center justify-center" 
                    title="Console Node Shell"
                  >
                    <Terminal size={16} />
                  </button>
                  <button 
                    onClick={() => handleNodeAction(node.id, 'reboot')}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-kve-warning/20 hover:text-kve-warning transition-all flex items-center justify-center" 
                    title="Reiniciar Node"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button 
                    onClick={() => handleNodeAction(node.id, 'shutdown')}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-kve-danger/20 hover:text-kve-danger transition-all flex items-center justify-center" 
                    title="Desligar Node"
                  >
                    <Power size={16} />
                  </button>
                </div>
              </div>
            </div>
          </KveCard>
        ))}
      </div>

      {/* Authorize All Modal */}
      <Modal 
        isOpen={isAuthAllModalOpen} 
        onClose={() => setIsAuthAllModalOpen(false)}
        title="Autorização em Massa"
        type="warning"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAuthAllModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">CANCELAR</button>
            <button onClick={handleAuthorizeAll} className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm">AUTORIZAR TODOS</button>
          </div>
        }
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-kve-warning/10 rounded-full text-kve-warning">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-300">Você está prestes a autorizar todos os nodes pendentes na rede.</p>
            <p className="text-xs text-slate-500 mt-2">Isso permitirá que novos clientes recebam imagens do sistema e montem volumes NFS centralizados. Certifique-se de que todos os nodes físicos são confiáveis.</p>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};

export default NodesView;
