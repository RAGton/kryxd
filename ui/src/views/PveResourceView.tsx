import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Settings, 
  Terminal, 
  Monitor, 
  Cpu, 
  HardDrive as Database, 
  History, 
  Zap,
  ShieldCheck,
  Server,
  Network,
  Lock,
  Box,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import KveCard from '../components/KveCard';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import TerminalConsole from '../components/dashboard/TerminalConsole';
import VmHardwareView from '../components/dashboard/VmHardwareView';
import StorageContentView from '../components/dashboard/StorageContentView';
import ClusterNodesView from '../components/dashboard/ClusterNodesView';
import VmListView from '../components/dashboard/VmListView';
import VmOptionsView from '../components/dashboard/VmOptionsView';
import FirewallRulesView from '../components/dashboard/FirewallRulesView';
import NodeNetworkView from '../components/dashboard/NodeNetworkView';
import SnapshotsView from '../components/dashboard/SnapshotsView';
import { changeInstanceState, getHostMetrics } from '../lib/api';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PveResourceViewProps {
  type: 'datacenter' | 'node' | 'qemu' | 'lxc' | 'storage';
  id: string;
  label: string;
}

interface HostMetrics {
  cpuPercent: number;
  memory: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
    usedPercent: number;
  };
}

interface MetricPoint {
  time: string;
  cpu: number;
  mem: number;
}

const initialChartData: MetricPoint[] = Array.from({ length: 20 }, (_, i) => ({
  time: `${i}:00`,
  cpu: 0,
  mem: 0,
}));

function formatMetricTime() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function roundMetric(value: number | undefined) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10) / 10;
}

function asHostMetrics(payload: any): HostMetrics {
  return {
    cpuPercent: roundMetric(payload?.cpuPercent ?? payload?.cpu_percent),
    memory: {
      totalMb: Number(payload?.memory?.totalMb ?? payload?.memory?.total_mb ?? 0),
      freeMb: Number(payload?.memory?.freeMb ?? payload?.memory?.free_mb ?? 0),
      usedMb: Number(payload?.memory?.usedMb ?? payload?.memory?.used_mb ?? 0),
      usedPercent: roundMetric(payload?.memory?.usedPercent ?? payload?.memory?.used_percent),
    },
  };
}

const PveResourceView: React.FC<PveResourceViewProps> = ({ type, id, label }) => {
  const [activeTab, setActiveTab] = useState('summary');
  const [chartData, setChartData] = useState<MetricPoint[]>(initialChartData);
  const [hostMetrics, setHostMetrics] = useState<HostMetrics | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  const tabs = [
    { id: 'summary', label: 'Sumário', icon: Activity },
    { id: 'nodes', label: 'Nodes', icon: Server, hidden: type !== 'datacenter' },
    { id: 'content', label: 'Conteúdo', icon: Database, hidden: type !== 'storage' },
    { id: 'vms', label: 'Virtual Machines', icon: Cpu, hidden: type !== 'node' && type !== 'datacenter' },
    { id: 'hardware', label: 'Hardware', icon: Settings, hidden: type !== 'qemu' && type !== 'lxc' },
    { id: 'snapshots', label: 'Snapshots', icon: Camera, hidden: type !== 'qemu' && type !== 'lxc' },
    { id: 'network', label: 'Rede', icon: Network, hidden: type === 'storage' },
    { id: 'firewall', label: 'Firewall', icon: ShieldCheck },
    { id: 'storage', label: 'Sistemas de Arquivos', icon: Database, hidden: type !== 'node' && type !== 'datacenter' },
    { id: 'backup', label: 'Backup', icon: History, hidden: type !== 'qemu' && type !== 'lxc' && type !== 'node' },
    { id: 'permissions', label: 'Permissões', icon: Lock },
    { id: 'options', label: 'Opções', icon: Settings, hidden: type === 'datacenter' },
    { id: 'task_history', label: 'Histórico de Tarefas', icon: History },
    { id: 'console', label: 'Console', icon: Terminal, hidden: type !== 'qemu' && type !== 'lxc' && type !== 'node' },
  ].filter(tab => !tab.hidden);

  useEffect(() => {
    // Reset tab if current tab is hidden for new resource type
    const currentTabHidden = tabs.find(t => t.id === activeTab)?.hidden;
    if (currentTabHidden) {
      setActiveTab('summary');
    }
  }, [type]);

  useEffect(() => {
    let alive = true;

    async function refreshMetrics() {
      try {
        const metrics = asHostMetrics(await getHostMetrics());
        if (!alive) return;

        setHostMetrics(metrics);
        setChartData((points) => [
          ...points.slice(-19),
          {
            time: formatMetricTime(),
            cpu: metrics.cpuPercent,
            mem: metrics.memory.usedPercent,
          },
        ]);
      } catch (error) {
        if (!alive) return;
        setOperationMessage((current) => current ?? {
          kind: 'error',
          text: `Telemetria indisponível: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
        });
      }
    }

    refreshMetrics();
    const timer = window.setInterval(refreshMetrics, 3_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  async function handleStateAction(action: 'start' | 'stop' | 'restart' | 'freeze') {
    setPendingAction(action);
    setOperationMessage({ kind: 'info', text: `Enviando ação ${action} para ${id}...` });

    try {
      await changeInstanceState(id, action);
      setOperationMessage({ kind: 'success', text: `Ação ${action} aceita pelo kryxd para ${id}.` });
    } catch (error) {
      setOperationMessage({
        kind: 'error',
        text: `Falha ao executar ${action}: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      });
    } finally {
      setPendingAction(null);
    }
  }

  const latestMetrics = hostMetrics ?? {
    cpuPercent: chartData[chartData.length - 1]?.cpu ?? 0,
    memory: {
      totalMb: 0,
      freeMb: 0,
      usedMb: 0,
      usedPercent: chartData[chartData.length - 1]?.mem ?? 0,
    },
  };
  const memoryUsedGb = latestMetrics.memory.usedMb / 1024;
  const memoryTotalGb = latestMetrics.memory.totalMb / 1024;
  const memorySummary = latestMetrics.memory.totalMb > 0
    ? `${memoryUsedGb.toFixed(1)} GB de ${memoryTotalGb.toFixed(1)} GB`
    : `${latestMetrics.memory.usedPercent}% usado`;

  const renderSummary = () => {
    if (type === 'qemu' || type === 'lxc') {
      return (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => handleStateAction('start')}
              disabled={pendingAction !== null}
              className="px-6 py-2 bg-kve-success/10 border border-kve-success/30 text-kve-success font-bold uppercase tracking-wider rounded-lg hover:bg-kve-success hover:text-white transition-all flex items-center gap-2 text-xs disabled:cursor-wait disabled:opacity-50"
            >
              <Zap size={14} /> {pendingAction === 'start' ? 'Starting…' : 'Start'}
            </button>
            <button
              onClick={() => handleStateAction('restart')}
              disabled={pendingAction !== null}
              className="px-6 py-2 bg-kve-warning/10 border border-kve-warning/30 text-kve-warning font-bold uppercase tracking-wider rounded-lg hover:bg-kve-warning hover:text-white transition-all flex items-center gap-2 text-xs disabled:cursor-wait disabled:opacity-50"
            >
              <Activity size={14} /> {pendingAction === 'restart' ? 'Rebooting…' : 'Reboot'}
            </button>
            <button
              onClick={() => handleStateAction('stop')}
              disabled={pendingAction !== null}
              className="px-6 py-2 bg-kve-danger/10 border border-kve-danger/30 text-kve-danger font-bold uppercase tracking-wider rounded-lg hover:bg-kve-danger hover:text-white transition-all flex items-center gap-2 text-xs disabled:cursor-wait disabled:opacity-50"
            >
              <Monitor size={14} /> {pendingAction === 'stop' ? 'Stopping…' : 'Shutdown'}
            </button>
            <div className="w-px h-6 bg-slate-700 mx-2" />
            <button 
              onClick={() => setActiveTab('console')}
              className="px-6 py-2 bg-kve-accent text-kve-bg font-bold uppercase tracking-wider rounded-lg hover:brightness-110 transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)] flex items-center gap-2 text-xs"
            >
              <Terminal size={14} /> Console
            </button>
            {operationMessage && (
              <div className={cn(
                'ml-auto rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-wider',
                operationMessage.kind === 'success' && 'border-kve-success/30 bg-kve-success/10 text-kve-success',
                operationMessage.kind === 'error' && 'border-kve-danger/30 bg-kve-danger/10 text-kve-danger',
                operationMessage.kind === 'info' && 'border-kve-accent/30 bg-kve-accent/10 text-kve-accent'
              )}>
                {operationMessage.text}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Status Card */}
            <div className="space-y-6">
              <KveCard title="Status do Recurso" className="h-full">
                <div className="flex flex-col h-full justify-center space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-kve-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-kve-success"></span>
                    </div>
                    <span className="text-2xl font-black text-white tracking-widest uppercase">UP</span>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-slate-800">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">Uptime</span>
                      <span className="text-sm text-slate-300 font-mono">14d 08h 12m</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">IP Address</span>
                      <span className="text-sm text-kve-accent font-mono">192.168.1.101</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">Base Image</span>
                      <span className="text-sm text-slate-300 font-mono">Ubuntu 24.04 LTS</span>
                    </div>
                  </div>
                </div>
              </KveCard>
            </div>

            {/* Right Column: Simplified Usage Charts */}
            <div className="space-y-6">
              <KveCard title="Consumo de Recursos" className="h-full">
                <div className="space-y-8 py-2">
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Cpu size={14} /> CPU Usage
                      </span>
                      <div className="text-right">
                        <span className="text-xl font-black text-white">{latestMetrics.cpuPercent}%</span>
                        <span className="text-[10px] text-slate-500 block">host global</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                      <div className="bg-gradient-to-r from-kve-success via-kve-warning to-kve-danger h-full" style={{ width: `${Math.min(latestMetrics.cpuPercent, 100)}%` }} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} /> RAM Usage
                      </span>
                      <div className="text-right">
                        <span className="text-xl font-black text-white">{memoryUsedGb.toFixed(1)} GB</span>
                        <span className="text-[10px] text-slate-500 block">{memorySummary} ({latestMetrics.memory.usedPercent}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                      <div className="bg-gradient-to-r from-kve-success via-kve-warning to-kve-danger h-full" style={{ width: `${Math.min(latestMetrics.memory.usedPercent, 100)}%` }} />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Database size={14} /> Disk I/O
                      </span>
                      <div className="text-right">
                        <span className="text-xl font-black text-white">12 MB/s</span>
                        <span className="text-[10px] text-slate-500 block">Pico Recente</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                      <div className="bg-gradient-to-r from-kve-success via-kve-success to-kve-success h-full" style={{ width: '15%' }} />
                    </div>
                  </div>
                </div>
              </KveCard>
            </div>
          </div>
        </div>
      );
    }

    return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KveCard title="Status" className="bg-slate-900/40">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-full bg-kve-success/10 text-kve-success">
               <Zap size={20} />
             </div>
             <div>
               <p className="text-xl font-bold text-white uppercase tracking-tight">Online</p>
               <p className="text-[10px] text-slate-500 uppercase font-mono">Uptime: 12d 5h 22m</p>
             </div>
          </div>
        </KveCard>
        <KveCard title={type === 'storage' ? 'Usage' : 'Uso de CPU'} className="bg-slate-900/40">
           <div className="space-y-2">
             <div className="flex justify-between text-xs">
               <span className="text-slate-400">{type === 'storage' ? '4.2 TB de 10 TB' : `${latestMetrics.cpuPercent}% host global`}</span>
             </div>
             <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
               <div className="h-full bg-kve-accent" style={{ width: type === 'storage' ? '42%' : `${Math.min(latestMetrics.cpuPercent, 100)}%` }} />
             </div>
           </div>
        </KveCard>
        <KveCard title={type === 'storage' ? 'IOPS' : 'Memória'} className="bg-slate-900/40">
           <div className="space-y-2">
             <div className="flex justify-between text-xs">
               <span className="text-slate-400">{type === 'storage' ? '1,245 ops/s' : memorySummary}</span>
             </div>
             <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
               <div className="h-full bg-kve-indigo" style={{ width: type === 'storage' ? '15%' : `${Math.min(latestMetrics.memory.usedPercent, 100)}%` }} />
             </div>
           </div>
        </KveCard>
        <KveCard title="Rede" className="bg-slate-900/40">
           <div className="flex items-center gap-4">
             <div className="flex-1">
               <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">In</p>
               <p className="text-sm font-mono text-kve-success">12.4 Mbps</p>
             </div>
             <div className="flex-1">
               <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Out</p>
               <p className="text-sm font-mono text-kve-warning">4.2 Mbps</p>
             </div>
           </div>
        </KveCard>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KveCard title={type === 'storage' ? 'IO Activity' : 'Gráfico de CPU'}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis stroke="#475569" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0b14', border: '1px solid #1e293b' }}
                  itemStyle={{ color: '#38bdf8' }}
                />
                <Area type="monotone" dataKey={type === 'storage' ? 'cpu' : 'cpu'} stroke="#38bdf8" fillOpacity={1} fill="url(#colorCpu)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </KveCard>
        <KveCard title={type === 'storage' ? 'Throughput' : 'Gráfico de Memória'}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis stroke="#475569" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0b14', border: '1px solid #1e293b' }}
                  itemStyle={{ color: '#6366f1' }}
                />
                <Area type="monotone" dataKey={type === 'storage' ? 'mem' : 'mem'} stroke="#6366f1" fillOpacity={1} fill="url(#colorMem)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </KveCard>
      </div>

      {/* Task Log Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <KveCard title="Log de Tarefas Recentes">
            {/* Table content as before */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-2 border border-kve-border tracking-tighter">Task ID</th>
                    <th className="px-4 py-2 border border-kve-border">Description</th>
                    <th className="px-4 py-2 border border-kve-border">Status</th>
                    <th className="px-4 py-2 border border-kve-border">Time</th>
                  </tr>
                </thead>
                <tbody className="text-slate-400">
                  {[
                    { id: 'UPID:node-01:001', desc: 'Resource Start', status: 'OK', time: '04:30' },
                    { id: 'UPID:node-01:002', desc: 'Backup Job', status: 'RUNNING', time: '04:45' },
                    { id: 'UPID:node-01:003', desc: 'Config Sync', status: 'OK', time: '04:55' },
                  ].map((task, i) => (
                    <tr key={i} className="hover:bg-slate-800/20">
                      <td className="px-4 py-1.5 border border-kve-border font-mono text-[10px]">{task.id}</td>
                      <td className="px-4 py-1.5 border border-kve-border">{task.desc}</td>
                      <td className="px-4 py-1.5 border border-kve-border">
                        <span className={task.status === 'OK' ? "text-kve-success font-bold" : "text-kve-warning font-bold animate-pulse"}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 border border-kve-border whitespace-nowrap">{task.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </KveCard>
        </div>
        <div className="lg:col-span-1">
          <KveCard title="Notes / Documentação">
            <div className="space-y-4">
              <textarea 
                placeholder="Adicione notas aqui..." 
                className="w-full h-40 bg-black/40 border border-kve-border rounded-lg p-3 text-xs text-slate-300 font-mono focus:outline-none focus:border-kve-accent/50 selection:bg-kve-accent/30"
                defaultValue={
                  "Notes for resource " + label
                }
              />
              <div className="flex justify-end">
                <button className="px-3 py-1 bg-slate-800 text-slate-400 text-[10px] font-bold rounded border border-slate-700 hover:text-white transition-all uppercase tracking-widest">
                  Salvar Notas
                </button>
              </div>
            </div>
          </KveCard>
        </div>
      </div>
    </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-full space-y-4"
    >
      {/* Header Info */}
      <div className="flex items-center justify-between bg-slate-900/60 p-4 border border-kve-border rounded-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-kve-accent/10 rounded-lg text-kve-accent">
            {type === 'node' ? <Server size={24} /> : type === 'qemu' ? <Cpu size={24} /> : type === 'storage' ? <Database size={24} /> : <Box size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight uppercase">{label}</h2>
              <span className="px-2 py-0.5 rounded bg-kve-success/20 text-kve-success text-[10px] font-bold uppercase">Online</span>
            </div>
            <p className="text-xs text-slate-500 font-mono tracking-tight">{type.toUpperCase()} ID: {id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           { (type === 'qemu' || type === 'lxc') && (
             <>
                <button
                  onClick={() => handleStateAction('start')}
                  disabled={pendingAction !== null}
                  className="px-3 py-1.5 rounded flex items-center gap-2 bg-kve-success text-kve-bg text-xs font-bold hover:bg-kve-success/90 transition-colors disabled:cursor-wait disabled:opacity-50"
                >
                  <Zap size={14} /> {pendingAction === 'start' ? 'STARTING' : 'START'}
                </button>
                <button
                  onClick={() => handleStateAction('stop')}
                  disabled={pendingAction !== null}
                  className="px-3 py-1.5 rounded flex items-center gap-2 bg-kve-danger text-white text-xs font-bold hover:bg-kve-danger/90 transition-colors disabled:cursor-wait disabled:opacity-50"
                >
                  <Activity size={14} /> {pendingAction === 'stop' ? 'STOPPING' : 'STOP'}
                </button>
             </>
           )}
           <button className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors">
             <Settings size={18} />
           </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex items-center gap-1 bg-slate-900/40 p-1 border border-kve-border rounded-lg overflow-x-auto whitespace-nowrap no-scrollbar shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all uppercase tracking-widest",
              activeTab === tab.id 
                ? "bg-kve-accent text-kve-bg shadow-[0_0_10px_rgba(56,189,248,0.3)]" 
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dynamic Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'summary' && renderSummary()}
            {activeTab === 'console' && <TerminalConsole nodeId={id} nodeName={label} />}
            {activeTab === 'hardware' && <VmHardwareView vmid={id} node="node-01" />}
            {activeTab === 'content' && <StorageContentView storageId={id} />}
            {activeTab === 'nodes' && <ClusterNodesView />}
            {activeTab === 'vms' && <VmListView nodeId={type === 'node' ? id : undefined} />}
            {activeTab === 'options' && <VmOptionsView />}
            {activeTab === 'firewall' && <FirewallRulesView />}
            {activeTab === 'network' && <NodeNetworkView />}
            {activeTab === 'snapshots' && <SnapshotsView vmid={id} node="node-01" />}
            {activeTab !== 'summary' && activeTab !== 'console' && activeTab !== 'hardware' && activeTab !== 'content' && activeTab !== 'nodes' && activeTab !== 'vms' && activeTab !== 'options' && activeTab !== 'firewall' && activeTab !== 'network' && activeTab !== 'snapshots' && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-600 bg-slate-900/20 rounded-2xl border border-dashed border-kve-border">
                {tabs.find(t => t.id === activeTab)?.icon && React.createElement(tabs.find(t => t.id === activeTab)!.icon, { size: 48, className: "mb-4 opacity-20" })}
                <p className="text-sm font-bold uppercase tracking-widest">Painel de {activeTab.replace('_', ' ')} em construção</p>
                <p className="text-xs font-mono mt-1 opacity-50 tracking-tighter">Status: Pending Module Load</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};


export default PveResourceView;
