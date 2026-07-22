import React from 'react';
import { Activity } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

const data = [
  { time: '10:00', value: 12 },
  { time: '10:05', value: 18 },
  { time: '10:10', value: 15 },
  { time: '10:15', value: 25 },
  { time: '10:20', value: 22 },
  { time: '10:25', value: 30 },
  { time: '10:30', value: 28 },
];

// TODO: V2 API Bind — trocar a série estática por /api/v2/metrics/host quando
// houver histórico de telemetria no Axum. Não chamar endpoints NodeJS legados.

const CpuWidget: React.FC = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-kve-accent">
          <Activity size={16} />
          <span className="text-xs font-bold uppercase tracking-widest">Load Average</span>
        </div>
        <span className="text-2xl font-bold text-white">28%</span>
      </div>
      <div className="flex-1 min-h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0a0b14', border: '1px solid #1e293b', borderRadius: '8px' }}
              itemStyle={{ color: '#38bdf8' }}
            />
            <Area type="monotone" dataKey="value" stroke="#38bdf8" fillOpacity={1} fill="url(#colorCpu)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CpuWidget;
