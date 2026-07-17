import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

const ServicesWidget: React.FC = () => {
  const services = [
    { name: 'dnsmasq', status: 'running' },
    { name: 'nginx', status: 'running' },
    { name: 'nfs-server', status: 'running' },
    { name: 'firewall', status: 'warning' },
  ];

  return (
    <div className="space-y-3">
      {services.map(s => (
        <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-kve-border">
          <div className="flex items-center gap-3">
            {s.status === 'running' ? (
              <CheckCircle2 size={14} className="text-kve-success" />
            ) : (
              <AlertTriangle size={14} className="text-kve-warning" />
            )}
            <span className="text-xs font-bold text-white uppercase tracking-tight">{s.name}</span>
          </div>
          <span className={s.status === 'running' ? "text-kve-success text-[10px] font-bold" : "text-kve-warning text-[10px] font-bold"}>
            {s.status.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
};

export default ServicesWidget;
