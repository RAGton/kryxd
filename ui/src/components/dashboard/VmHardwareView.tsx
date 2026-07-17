import React, { useState, useEffect } from 'react';
import { Settings, Cpu, MousePointer2, Network, HardDrive, Disc, RotateCw, Monitor, Save } from 'lucide-react';
import { motion } from 'motion/react';

interface VmHardwareViewProps {
  vmid: string;
  node: string;
}

const VmHardwareView: React.FC<VmHardwareViewProps> = ({ vmid, node }) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/nodes/${node}/vms/${vmid}/config`)
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      });
  }, [vmid, node]);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse uppercase text-xs font-mono">Loading Hardware Config...</div>;

  const hardwareItems = [
    { label: 'Memory', value: `${config.memory} MiB`, icon: Monitor },
    { label: 'Processors', value: `${config.sockets} Sockets, ${config.cores} Cores`, icon: Cpu },
    { label: 'BIOS', value: 'Default (OVMF)', icon: Settings },
    { label: 'Display', value: 'Default (std)', icon: Monitor },
    { label: 'SCSI Controller', value: 'VirtIO SCSI Single', icon: HardDrive },
    { label: 'Hard Disk (scsi0)', value: config.scsi0, icon: HardDrive },
    { label: 'CD/DVD Drive (ide2)', value: 'None', icon: Disc },
    { label: 'Network Device (net0)', value: config.net0, icon: Network },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/40 p-4 border border-kve-border rounded-xl">
        <div className="flex items-center gap-3">
          <Settings size={18} className="text-kve-accent" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">Hardware Configuration</h3>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold rounded border border-slate-700 hover:bg-slate-700 transition-colors uppercase tracking-widest flex items-center gap-2">
            <RotateCw size={12} /> REVERT
          </button>
          <button className="px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded hover:bg-kve-accent/90 transition-colors uppercase tracking-widest flex items-center gap-2">
            <Save size={12} /> APPLY CHANGES
          </button>
        </div>
      </div>

      <div className="bg-slate-900/20 border border-kve-border rounded-xl overflow-hidden">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/50">
            <tr>
              <th className="px-4 py-2 border-b border-kve-border w-1/3">Key</th>
              <th className="px-4 py-2 border-b border-kve-border">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kve-border/30">
            {hardwareItems.map((item, i) => (
              <tr key={i} className="group hover:bg-slate-800/30 transition-colors cursor-pointer">
                <td className="px-4 py-3 flex items-center gap-3 font-medium text-slate-300">
                  <item.icon size={14} className="text-slate-500 group-hover:text-kve-accent transition-colors" />
                  {item.label}
                </td>
                <td className="px-4 py-3 font-mono text-slate-400 group-hover:text-white">
                  {item.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-kve-warning/5 border border-kve-warning/20 rounded-xl flex items-start gap-4">
        <div className="bg-kve-warning/10 p-2 rounded text-kve-warning">
          <Settings size={16} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-kve-warning uppercase tracking-widest">Pending Changes</h4>
          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Some changes require a VM reboot to take effect. Ensure all critical processes are saved before applying hardware modifications.</p>
        </div>
      </div>
    </div>
  );
};

export default VmHardwareView;
