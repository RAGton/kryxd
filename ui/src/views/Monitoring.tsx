import React from 'react';
import { motion } from 'motion/react';
import { Activity, Cpu, Database, Network, Zap, Clock, ArrowUpRight, ArrowDownRight, Server } from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar
} from 'recharts';
import KveCard from '../components/KveCard';

const mockChartData = [
  { time: '10:00', cpu: 12, ram: 45, net: 120, disk: 15 },
  { time: '10:05', cpu: 18, ram: 46, net: 150, disk: 18 },
  { time: '10:10', cpu: 15, ram: 45, net: 130, disk: 14 },
  { time: '10:15', cpu: 25, ram: 48, net: 210, disk: 22 },
  { time: '10:20', cpu: 22, ram: 47, net: 180, disk: 19 },
  { time: '10:25', cpu: 30, ram: 50, net: 250, disk: 25 },
  { time: '10:30', cpu: 28, ram: 49, net: 220, disk: 21 },
];

const MonitoringView: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Monitoramento em Tempo Real</h2>
          <p className="text-slate-500 text-sm">Métricas detalhadas de performance e saúde do sistema</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-kve-success/10 border border-kve-success/20">
          <div className="w-2 h-2 rounded-full bg-kve-success animate-pulse" />
          <span className="text-[10px] font-bold text-kve-success uppercase tracking-widest">Live Feed Ativo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KveCard 
          title="Utilização de CPU" 
          subtitle="Carga por núcleo (Média)" 
          icon={<Cpu size={16} />}
        >
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0b14', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px', color: '#f1f5f9' }} />
                <Area type="monotone" dataKey="cpu" stroke="#38bdf8" fillOpacity={1} fill="url(#colorCpu)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </KveCard>

        <KveCard 
          title="Memória RAM" 
          subtitle="Alocação de memória física" 
          icon={<Database size={16} />}
        >
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0b14', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px', color: '#f1f5f9' }} />
                <Area type="monotone" dataKey="ram" stroke="#1d4ed8" fillOpacity={1} fill="url(#colorRam)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </KveCard>

        <KveCard 
          title="Tráfego de Rede" 
          subtitle="Throughput de entrada/saída" 
          icon={<Network size={16} />}
        >
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}Mbps`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0b14', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px', color: '#f1f5f9' }} />
                <Line type="monotone" dataKey="net" stroke="#38bdf8" strokeWidth={2} dot={{ r: 4, fill: '#38bdf8' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </KveCard>

        <KveCard 
          title="I/O de Disco" 
          subtitle="Operações de leitura/escrita" 
          icon={<Zap size={16} />}
        >
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}MB/s`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0b14', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px', color: '#f1f5f9' }} />
                <Bar dataKey="disk" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </KveCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KveCard className="glass-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-kve-accent/10 rounded-lg text-kve-accent">
              <Clock size={20} />
            </div>
            <span className="text-[10px] font-bold text-kve-success bg-kve-success/10 px-2 py-0.5 rounded-full">ESTÁVEL</span>
          </div>
          <h4 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Uptime do Sistema</h4>
          <p className="text-2xl font-bold text-white">12d 4h 32m</p>
        </KveCard>

        <KveCard className="glass-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-kve-warning/10 rounded-lg text-kve-warning">
              <Server size={20} />
            </div>
            <span className="text-[10px] font-bold text-kve-warning bg-kve-warning/10 px-2 py-0.5 rounded-full">ALERTA</span>
          </div>
          <h4 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Temperatura CPU</h4>
          <p className="text-2xl font-bold text-white">62°C</p>
        </KveCard>

        <KveCard className="glass-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-kve-success/10 rounded-lg text-kve-success">
              <Activity size={20} />
            </div>
            <span className="text-[10px] font-bold text-kve-success bg-kve-success/10 px-2 py-0.5 rounded-full">NORMAL</span>
          </div>
          <h4 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Processos Ativos</h4>
          <p className="text-2xl font-bold text-white">242</p>
        </KveCard>
      </div>
    </motion.div>
  );
};

export default MonitoringView;
