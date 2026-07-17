import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

const AlertsWidget: React.FC = () => {
  const alerts = [
    { type: 'warning', msg: 'Quota excedida: user-rocha', time: '2m ago' },
    { type: 'info', msg: 'Backup concluído com sucesso', time: '15m ago' },
    { type: 'warning', msg: 'Latência alta no node-042', time: '1h ago' },
  ];

  return (
    <div className="space-y-3">
      {alerts.map((a, i) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/40 border border-kve-border">
          {a.type === 'warning' ? (
            <AlertTriangle size={14} className="text-kve-warning" />
          ) : (
            <Info size={14} className="text-kve-accent" />
          )}
          <div className="flex-1">
            <p className="text-xs text-slate-300">{a.msg}</p>
            <p className="text-[8px] text-slate-500 uppercase font-bold">{a.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AlertsWidget;
