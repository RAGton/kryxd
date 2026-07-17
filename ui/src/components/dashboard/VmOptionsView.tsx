import React from 'react';
import { Settings, Play, Shield, Globe, Clock, Box } from 'lucide-react';

const VmOptionsView: React.FC = () => {
  const options = [
    { key: 'Name', value: 'debian-prod', icon: Box, description: 'User-friendly name of the VM' },
    { key: 'Start at boot', value: 'Yes', icon: Play, description: 'Automatically start VM when host boots' },
    { key: 'OS Type', value: 'Linux 6.x - 2.6 Kernel', icon: Globe, description: 'Optimizations for guest OS' },
    { key: 'Boot Order', value: 'scsi0; ide2; net0', icon: Clock, description: 'Priority of boot devices' },
    { key: 'Use Tablet for Pointer', value: 'Yes', icon: Settings, description: 'Improves mouse tracking in VNC' },
    { key: 'Protection', value: 'No', icon: Shield, description: 'Prevent accidental deletion' },
  ];

  return (
    <div className="space-y-4">
       <div className="flex items-center justify-between bg-slate-900/40 p-4 border border-kve-border rounded-xl">
        <div className="flex items-center gap-3">
          <Settings size={18} className="text-kve-accent" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">General Options</h3>
        </div>
        <button className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold rounded border border-slate-700 hover:bg-slate-700 transition-colors uppercase tracking-widest">
           Edit
        </button>
      </div>

      <div className="bg-slate-900/20 border border-kve-border rounded-xl overflow-hidden">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 border-b border-kve-border">Option</th>
              <th className="px-4 py-3 border-b border-kve-border">Value</th>
              <th className="px-4 py-3 border-b border-kve-border">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kve-border/30">
            {options.map((opt, i) => (
              <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-300">
                  <div className="flex items-center gap-3">
                    <opt.icon size={14} className="text-slate-500" />
                    {opt.key}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-kve-accent">
                   {opt.value}
                </td>
                <td className="px-4 py-3 text-slate-500 italic">
                   {opt.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VmOptionsView;
