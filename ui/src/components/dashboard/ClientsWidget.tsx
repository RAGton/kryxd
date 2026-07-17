import React from 'react';
import { Users } from 'lucide-react';

const ClientsWidget: React.FC = () => {
  return (
    <div className="h-full flex flex-col justify-center items-center">
      <div className="p-3 bg-kve-success/10 rounded-full text-kve-success mb-2">
        <Users size={24} />
      </div>
      <span className="text-3xl font-bold text-white">1,242</span>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sessões Ativas</span>
    </div>
  );
};

export default ClientsWidget;
