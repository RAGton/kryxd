import React from 'react';
import { Shield, Plus, Power, Trash2, ArrowRight } from 'lucide-react';

const FirewallRulesView: React.FC = () => {
  const rules = [
    { enable: true, type: 'in', action: 'ACCEPT', source: '10.0.0.0/24', dest: 'ANY', proto: 'TCP', port: '22', comment: 'SSH Access' },
    { enable: true, type: 'in', action: 'ACCEPT', source: 'ANY', dest: 'ANY', proto: 'TCP', port: '80,443', comment: 'Web Traffic' },
    { enable: false, type: 'out', action: 'DROP', source: 'ANY', dest: '8.8.8.8', proto: 'UDP', port: '53', comment: 'Block Google DNS' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 bg-slate-900/40 p-3 border border-kve-border rounded-xl">
        <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded uppercase tracking-widest hover:bg-kve-accent/90 transition-colors">
              <Plus size={14} /> Add Rule
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold rounded border border-slate-700 uppercase tracking-widest hover:bg-slate-700 transition-colors">
              <Power size={14} /> Firewall On/Off
            </button>
        </div>
      </div>

      <div className="bg-slate-900/20 border border-kve-border rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/60">
            <tr>
              <th className="px-4 py-3 border-b border-kve-border">Active</th>
              <th className="px-4 py-3 border-b border-kve-border">Type</th>
              <th className="px-4 py-3 border-b border-kve-border">Action</th>
              <th className="px-4 py-3 border-b border-kve-border">Source</th>
              <th className="px-4 py-3 border-b border-kve-border">Destination</th>
              <th className="px-4 py-3 border-b border-kve-border">Protocol</th>
              <th className="px-4 py-3 border-b border-kve-border">Port</th>
              <th className="px-4 py-3 border-b border-kve-border">Comment</th>
              <th className="px-4 py-3 border-b border-kve-border text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kve-border/20">
            {rules.map((rule, i) => (
              <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${!rule.enable && 'opacity-40'}`}>
                <td className="px-4 py-3">
                   <div className={`w-3 h-3 rounded-sm border ${rule.enable ? 'bg-kve-success border-kve-success' : 'border-slate-600'}`} />
                </td>
                <td className="px-4 py-3 uppercase font-bold text-[10px]">
                   <div className="flex items-center gap-1">
                     {rule.type === 'in' ? <ArrowRight size={10} className="rotate-0" /> : <ArrowRight size={10} className="rotate-180" />}
                     {rule.type}
                   </div>
                </td>
                <td className="px-4 py-3">
                   <span className={`font-bold ${rule.action === 'ACCEPT' ? 'text-kve-success' : 'text-kve-danger'}`}>
                     {rule.action}
                   </span>
                </td>
                <td className="px-4 py-3 font-mono">{rule.source}</td>
                <td className="px-4 py-3 font-mono">{rule.dest}</td>
                <td className="px-4 py-3 uppercase">{rule.proto}</td>
                <td className="px-4 py-3 font-mono">{rule.port}</td>
                <td className="px-4 py-3 text-slate-500 italic">{rule.comment}</td>
                <td className="px-4 py-3 text-right">
                   <button className="p-1.5 rounded hover:bg-kve-danger/10 text-slate-500 hover:text-kve-danger transition-colors">
                      <Trash2 size={14} />
                   </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FirewallRulesView;
