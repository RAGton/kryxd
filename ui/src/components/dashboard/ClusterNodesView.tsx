import React, { useState, useEffect } from 'react';
import { Server, Activity, Cpu, HardDrive, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';

const ClusterNodesView: React.FC = () => {
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/nodes')
      .then(res => res.json())
      .then(data => {
        setNodes(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse text-xs font-mono uppercase">Loading Cluster Nodes...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/20 border border-kve-border rounded-xl overflow-hidden">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 border-b border-kve-border">Node</th>
              <th className="px-4 py-3 border-b border-kve-border">Status</th>
              <th className="px-4 py-3 border-b border-kve-border">CPU Usage</th>
              <th className="px-4 py-3 border-b border-kve-border">Memory</th>
              <th className="px-4 py-3 border-b border-kve-border">Disk</th>
              <th className="px-4 py-3 border-b border-kve-border">Uptime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kve-border/30">
            {nodes.map((node, i) => (
              <tr key={i} className="hover:bg-slate-800/30 transition-colors cursor-pointer">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Server size={14} className={node.status === 'online' ? "text-kve-success" : "text-slate-600"} />
                    <span className="font-bold text-slate-200">{node.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {node.status === 'online' ? (
                    <div className="flex items-center gap-1.5 text-kve-success">
                      <CheckCircle2 size={12} />
                      <span className="text-[10px] font-bold uppercase">Online</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-kve-danger">
                      <AlertTriangle size={12} />
                      <span className="text-[10px] font-bold uppercase">Offline</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="w-24 group relative">
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                       <div 
                         className={`h-full transition-all duration-500 ${node.cpu > 0.5 ? 'bg-kve-danger' : 'bg-kve-accent'}`}
                         style={{ width: `${node.cpu * 100}%` }}
                       />
                    </div>
                    <span className="absolute -top-4 right-0 text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">{(node.cpu * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="w-24 group relative">
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-kve-indigo transition-all duration-500"
                         style={{ width: `${node.mem * 100}%` }}
                       />
                    </div>
                    <span className="absolute -top-4 right-0 text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">{(node.mem * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="w-24 group relative">
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-slate-500 transition-all duration-500"
                         style={{ width: `${node.disk * 100}%` }}
                       />
                    </div>
                    <span className="absolute -top-4 right-0 text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">{(node.disk * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono italic">
                  {node.uptime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="p-4 bg-slate-900/40 border border-kve-border rounded-xl">
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Cores</p>
           <p className="text-xl font-bold text-white">48 <span className="text-xs font-normal text-slate-600">Across 3 Nodes</span></p>
         </div>
         <div className="p-4 bg-slate-900/40 border border-kve-border rounded-xl">
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total RAM</p>
           <p className="text-xl font-bold text-white">384 GB <span className="text-xs font-normal text-slate-600">Enterprise Grade</span></p>
         </div>
         <div className="p-4 bg-slate-900/40 border border-kve-border rounded-xl">
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Storage</p>
           <p className="text-xl font-bold text-white">30 TB <span className="text-xs font-normal text-slate-600">ZFS Raid-Z2</span></p>
         </div>
      </div>
    </div>
  );
};

export default ClusterNodesView;
