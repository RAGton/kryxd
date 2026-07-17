import React from 'react';
import { Network, Plus, RotateCcw, Power } from 'lucide-react';

const NodeNetworkView: React.FC = () => {
  const interfaces = [
    { name: 'enp0s3', type: 'eth', active: 'Yes', port: 'Yes', autostart: 'Yes', address: '', gateway: '', comment: 'Physical Interface' },
    { name: 'vmbr0', type: 'bridge', active: 'Yes', port: 'No', autostart: 'Yes', address: '192.168.1.100/24', gateway: '192.168.1.1', comment: 'Management Bridge' },
    { name: 'vmbr1', type: 'bridge', active: 'Yes', port: 'No', autostart: 'Yes', address: '10.0.0.1/24', gateway: '', comment: 'Private Network' },
  ];

  return (
    <div className="space-y-4">
       <div className="flex items-center justify-between gap-4 bg-slate-900/40 p-3 border border-kve-border rounded-xl">
        <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded uppercase tracking-widest hover:bg-kve-accent/90 transition-all">
              <Plus size={14} /> Create Bridge
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold rounded border border-slate-700 uppercase tracking-widest hover:bg-slate-700 transition-all">
              <RotateCcw size={14} /> Revert
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-kve-warning text-kve-bg text-[10px] font-bold rounded uppercase tracking-widest hover:bg-kve-warning/90 transition-all">
              <Power size={14} /> Apply Configuration
            </button>
        </div>
      </div>

      <div className="bg-slate-900/20 border border-kve-border rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/60 sticky top-0">
            <tr>
              <th className="px-4 py-3 border-b border-kve-border">Name</th>
              <th className="px-4 py-3 border-b border-kve-border">Type</th>
              <th className="px-4 py-3 border-b border-kve-border">Active</th>
              <th className="px-4 py-3 border-b border-kve-border">Autostart</th>
              <th className="px-4 py-3 border-b border-kve-border">IP Address</th>
              <th className="px-4 py-3 border-b border-kve-border">Gateway</th>
              <th className="px-4 py-3 border-b border-kve-border">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kve-border/20">
            {interfaces.map((iface, i) => (
              <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Network size={14} className="text-kve-accent" />
                    <span className="font-bold text-slate-200">{iface.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 uppercase text-[10px] font-mono text-slate-500">{iface.type}</td>
                <td className="px-4 py-3">
                   <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${iface.active === 'Yes' ? 'text-kve-success bg-kve-success/10' : 'text-slate-500 bg-slate-500/10'}`}>
                     {iface.active}
                   </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{iface.autostart}</td>
                <td className="px-4 py-3 font-mono text-kve-accent">{iface.address || '-'}</td>
                <td className="px-4 py-3 font-mono text-slate-400">{iface.gateway || '-'}</td>
                <td className="px-4 py-3 text-slate-500 italic">{iface.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default NodeNetworkView;
