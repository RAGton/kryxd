import React from 'react';
import { Cpu } from 'lucide-react';

// TODO: V2 API Bind — trocar os valores estáticos por /api/v2/metrics/host.
// Mantido estático nesta fase para não depender de mock server NodeJS.
const MemoryWidget: React.FC = () => {
  return (
    <div className="h-full flex flex-col justify-center">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-kve-indigo">
          <Cpu size={16} />
          <span className="text-xs font-bold uppercase tracking-widest">RAM Usage</span>
        </div>
        <span className="text-2xl font-bold text-white">4.2 GB</span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
          <span className="text-slate-500">Used: 4.2 GB</span>
          <span className="text-slate-500">Total: 16 GB</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-kve-indigo" style={{ width: '26%' }} />
        </div>
      </div>
    </div>
  );
};

export default MemoryWidget;
