import React from 'react';
import { Database } from 'lucide-react';

// TODO: V2 API Bind — trocar os valores estáticos por /api/v2/storage/pools
// ou contrato agregado de storage no Axum. Não chamar /api/storage legado.
const StorageWidget: React.FC = () => {
  return (
    <div className="h-full flex flex-col justify-center">
      <div className="flex items-center gap-2 text-kve-success mb-4">
        <Database size={16} />
        <span className="text-xs font-bold uppercase tracking-widest">Ceph Pool</span>
      </div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-2xl font-bold text-white">4.2 TB</span>
        <span className="text-[10px] font-bold text-slate-500">85%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-kve-success" style={{ width: '85%' }} />
      </div>
    </div>
  );
};

export default StorageWidget;
