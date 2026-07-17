import React from 'react';
import { Zap } from 'lucide-react';

const GenerationsWidget: React.FC = () => {
  return (
    <div className="h-full flex flex-col justify-between">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-kve-accent/10 rounded-lg text-kve-accent">
          <Zap size={16} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Geração Ativa</p>
          <p className="text-xl font-bold text-white tracking-tighter">#142</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-slate-900/40 border border-kve-border text-center">
          <p className="text-[8px] font-bold text-slate-500 uppercase">Estável</p>
          <p className="text-xs font-bold text-kve-success">#141</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-900/40 border border-kve-border text-center">
          <p className="text-[8px] font-bold text-slate-500 uppercase">Rollback</p>
          <p className="text-xs font-bold text-kve-danger">#140</p>
        </div>
      </div>
    </div>
  );
};

export default GenerationsWidget;
