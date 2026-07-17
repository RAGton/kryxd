import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Server, Play, Square, RotateCcw, Terminal, Activity, Cpu, Database, Network, Search, Filter, CheckCircle2, AlertTriangle, XCircle, RotateCw } from 'lucide-react';
import KveCard from '../components/KveCard';
import { Service } from '../types';
import { clsx } from 'clsx';

const ServicesView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/services');
      if (res.ok) {
        const data = await res.json();
        setServicesList(data);
      }
    } catch (e) {
      console.error("Error loading services", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    // Poll services occasionally to show dynamic load shifts
    const interval = setInterval(fetchServices, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    setActioning(name + "-" + action);
    try {
      const res = await fetch(`/api/services/${name}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        await fetchServices();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActioning(null);
    }
  };

  const runningCount = servicesList.filter(s => s.status === 'running').length;
  const stoppedCount = servicesList.filter(s => s.status === 'stopped').length;
  const failedCount = servicesList.filter(s => s.status === 'failed').length;

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 font-mono text-xs uppercase animate-pulse">
        <Server className="mx-auto mb-4 animate-spin text-kve-accent" size={24} />
        Sincronizando serviços do cluster NixOS...
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Serviços do Sistema</h2>
          <p className="text-slate-500 text-sm">Monitoramento e controle de processos críticos da infraestrutura</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Buscar serviço..." 
              className="bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchServices}
            className="p-2 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-colors"
            title="Recarregar"
          >
            <RotateCw size={18} />
          </button>
        </div>
      </div>

      {/* Grid Status Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-kve-success/10 rounded-lg text-kve-success">
              <CheckCircle2 size={18} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ativos</p>
          </div>
          <p className="text-3xl font-bold text-white">{runningCount}</p>
        </KveCard>
        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
              <AlertTriangle size={18} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Parados</p>
          </div>
          <p className="text-3xl font-bold text-white">{stoppedCount}</p>
        </KveCard>
        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-kve-danger/10 rounded-lg text-kve-danger">
              <XCircle size={18} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Falhas</p>
          </div>
          <p className="text-3xl font-bold text-white">{failedCount}</p>
        </KveCard>
        <KveCard className="glass-hover">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-kve-accent/10 rounded-lg text-kve-accent">
              <Activity size={18} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Load Average</p>
          </div>
          <p className="text-3xl font-bold text-white">0.31</p>
        </KveCard>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {servicesList
          .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
          .map((service) => {
            const isServiceActioning = actioning?.startsWith(service.name);
            return (
              <KveCard key={service.name} className="group hover:border-kve-accent/30 transition-all duration-300">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "p-3 rounded-xl",
                      service.status === 'running' ? "bg-kve-success/10 text-kve-success" :
                      service.status === 'failed' ? "bg-kve-danger/10 text-kve-danger" :
                      "bg-slate-800 text-slate-500"
                    )}>
                      <Server size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight uppercase">{service.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={clsx(
                          "w-2 h-2 rounded-full",
                          service.status === 'running' ? "bg-kve-success shadow-[0_0_8px_rgba(16,185,129,0.7)]" :
                          service.status === 'failed' ? "bg-kve-danger shadow-[0_0_8px_rgba(239,68,68,0.7)]" :
                          "bg-slate-600"
                        )} />
                        <span className={clsx(
                          "text-[10px] font-bold uppercase tracking-widest",
                          service.status === 'running' ? "text-kve-success" :
                          service.status === 'failed' ? "text-kve-danger" :
                          "text-slate-500"
                        )}>{service.status}</span>
                        <span className="text-slate-700 mx-1">|</span>
                        <span className="text-[10px] text-slate-500 font-mono uppercase">Uptime: {service.uptime}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions buttons */}
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAction(service.name, 'restart')}
                      disabled={isServiceActioning}
                      className={clsx(
                        "p-2 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-kve-accent hover:border-kve-accent/30 transition-all",
                        isServiceActioning && "opacity-50 cursor-not-allowed animate-spin"
                      )} 
                      title="Reiniciar serviço"
                    >
                      <RotateCcw size={16} />
                    </button>
                    {service.status === 'running' ? (
                      <button 
                        onClick={() => handleAction(service.name, 'stop')}
                        disabled={isServiceActioning}
                        className="p-2 rounded-lg bg-kve-danger/10 border border-kve-danger/20 text-kve-danger hover:bg-kve-danger hover:text-white transition-all" 
                        title="Parar serviço"
                      >
                        <Square size={16} />
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleAction(service.name, 'start')}
                        disabled={isServiceActioning}
                        className="p-2 rounded-lg bg-kve-success/10 border border-kve-success/20 text-kve-success hover:bg-kve-success hover:text-white transition-all" 
                        title="Iniciar serviço"
                      >
                        <Play size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Service stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-kve-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Cpu size={12} /> Uso de CPU
                      </span>
                      <span className="text-xs font-mono text-white">{service.cpu}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                      <div className="bg-kve-accent h-full transition-all duration-500" style={{ width: `${Math.min((service.cpu || 0) * 10, 100)}%` }} />
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-kve-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Database size={12} /> Memória
                      </span>
                      <span className="text-xs font-mono text-white">{service.memory} MB</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                      <div className="bg-kve-indigo h-full transition-all duration-500" style={{ width: `${Math.min(((service.memory || 0) / 1024) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </KveCard>
            );
          })}
      </div>
    </motion.div>
  );
};

export default ServicesView;
