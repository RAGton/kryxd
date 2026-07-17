import React, { useState, useEffect } from 'react';
import { Cpu, Box, Play, Square, RotateCcw, Monitor, Settings, Search } from 'lucide-react';

const VmListView: React.FC<{ nodeId?: string }> = ({ nodeId = 'pve-01' }) => {
  const [vms, setVms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/nodes/${nodeId}/vms`)
      .then(res => res.json())
      .then(data => {
        setVms(data);
        setLoading(false);
      });
  }, [nodeId]);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse text-xs font-mono uppercase">Loading Virtual Machines...</div>;

  return (
    <div className="space-y-4">
      {/* Header with Search and Stats */}
      <div className="flex items-center justify-between gap-4 bg-slate-900/40 p-3 border border-kve-border rounded-xl">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-kve-success/20 border border-kve-success/30 flex items-center justify-center text-kve-success text-[10px] font-bold">3</div>
            <div className="w-8 h-8 rounded-full bg-kve-danger/20 border border-kve-danger/30 flex items-center justify-center text-kve-danger text-[10px] font-bold">2</div>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Running / Suspended</p>
        </div>
        <div className="flex-1 max-w-sm relative">
           <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
           <input 
             type="text" 
             placeholder="Search VMs or Containers..." 
             className="w-full bg-black/40 border border-kve-border rounded-lg py-1.5 pl-9 pr-4 text-xs text-slate-300 focus:outline-none focus:border-kve-accent/50 transition-all font-mono"
           />
        </div>
        <div className="flex gap-1">
           <button className="px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded uppercase tracking-widest hover:bg-kve-accent/90 transition-all">Create VM</button>
           <button className="px-3 py-1.5 bg-slate-800 text-slate-400 text-[10px] font-bold rounded border border-slate-700 uppercase tracking-widest hover:text-white transition-all">Create CT</button>
        </div>
      </div>

      <div className="bg-slate-900/20 border border-kve-border rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/60 sticky top-0">
            <tr>
              <th className="px-4 py-3 border-b border-kve-border">VMID</th>
              <th className="px-4 py-3 border-b border-kve-border">Name</th>
              <th className="px-4 py-3 border-b border-kve-border">Status</th>
              <th className="px-4 py-3 border-b border-kve-border">CPU %</th>
              <th className="px-4 py-3 border-b border-kve-border">Memory</th>
              <th className="px-4 py-3 border-b border-kve-border">Type</th>
              <th className="px-4 py-3 border-b border-kve-border text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kve-border/20">
            {vms.map((vm, i) => (
              <tr key={i} className="group hover:bg-kve-accent/5 transition-all">
                <td className="px-4 py-3 font-mono text-slate-500">{vm.id}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {vm.type === 'qemu' ? <Cpu size={14} className="text-kve-accent" /> : <Box size={14} className="text-kve-indigo" />}
                    <span className="font-bold text-slate-200">{vm.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                    vm.status === 'running' 
                      ? 'text-kve-success bg-kve-success/10 border-kve-success/20' 
                      : 'text-slate-500 bg-slate-500/10 border-slate-500/20'
                  }`}>
                    <div className={`w-1 h-1 rounded-full ${vm.status === 'running' ? 'bg-kve-success animate-pulse' : 'bg-slate-500'}`} />
                    {vm.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                   <div className="flex items-center gap-2">
                     <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-kve-accent" style={{ width: `${vm.cpu * 100}%` }} />
                     </div>
                     <span className="font-mono text-[10px] w-8">{(vm.cpu * 100).toFixed(1)}%</span>
                   </div>
                </td>
                <td className="px-4 py-3 text-slate-400 font-mono italic">
                   {(vm.mem / 1024).toFixed(1)} GiB
                </td>
                <td className="px-4 py-3">
                   <span className="text-[10px] uppercase font-mono text-slate-600">{vm.type}</span>
                </td>
                <td className="px-4 py-3 text-right">
                   <div className="flex items-center justify-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-kve-success/20 text-kve-success transition-colors" title="Start">
                        <Play size={12} fill="currentColor" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-kve-danger/20 text-kve-danger transition-colors" title="Stop">
                        <Square size={12} fill="currentColor" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Console">
                        <Monitor size={12} />
                      </button>
                      <button className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Console">
                        <Settings size={12} />
                      </button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VmListView;
