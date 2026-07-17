import React, { useState, useEffect } from 'react';
import { Camera, History, Trash2, ArrowBigDown, Edit3, Save } from 'lucide-react';
import { motion } from 'motion/react';

interface SnapshotsViewProps {
  vmid: string;
  node: string;
}

const SnapshotsView: React.FC<SnapshotsViewProps> = ({ vmid, node }) => {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/nodes/${node}/vms/${vmid}/snapshots`)
      .then(res => res.json())
      .then(data => {
        setSnapshots(data);
        setLoading(false);
      });
  }, [vmid, node]);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse text-xs font-mono uppercase">Loading Snapshots...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/40 p-4 border border-kve-border rounded-xl">
        <div className="flex items-center gap-3">
          <Camera size={18} className="text-kve-accent" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">Snapshot Management</h3>
        </div>
        <button className="px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded hover:bg-kve-accent/90 transition-colors uppercase tracking-widest flex items-center gap-2">
          <Camera size={14} /> Take Snapshot
        </button>
      </div>

      <div className="bg-slate-900/20 border border-kve-border rounded-xl p-6">
        <div className="relative">
          {/* Vertical line for the tree */}
          <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-kve-border" />

          <div className="space-y-6">
            {snapshots.map((snap, i) => (
              <div key={i} className="relative pl-14 group">
                {/* Connection dot */}
                <div className={`absolute left-[19px] top-4 w-3.5 h-3.5 rounded-full border-2 border-slate-900 shadow-[0_0_5px_rgba(0,0,0,0.5)] z-10 transition-colors ${
                  snap.name === 'current' ? 'bg-kve-accent animate-pulse' : 'bg-kve-border group-hover:bg-slate-500'
                }`} />
                
                {/* Content Card */}
                <div className={`p-4 rounded-xl border transition-all duration-300 ${
                  snap.name === 'current' 
                    ? 'bg-kve-accent/10 border-kve-accent shadow-[0_0_15px_rgba(56,189,248,0.1)]' 
                    : 'bg-slate-900/50 border-kve-border hover:border-slate-700'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${snap.name === 'current' ? 'text-kve-accent' : 'text-slate-300'}`}>
                        {snap.name === 'current' ? 'NOW (UNSAVED CHANGES)' : snap.name}
                      </span>
                      {snap.name !== 'current' && (
                        <span className="text-[10px] text-slate-500 font-mono italic">
                          {new Date(snap.time).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {snap.name !== 'current' && (
                         <>
                            <button className="p-1 px-2 text-[8px] font-bold uppercase bg-kve-warning/10 text-kve-warning border border-kve-warning/30 rounded hover:bg-kve-warning/20 transition-all flex items-center gap-1">
                              <ArrowBigDown size={10} /> Rollback
                            </button>
                            <button className="p-1.5 text-slate-500 hover:text-white"><Edit3 size={12} /></button>
                            <button className="p-1.5 text-slate-500 hover:text-kve-danger"><Trash2 size={12} /></button>
                         </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-mono italic">
                    {snap.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-900/40 border border-kve-border rounded-xl flex items-center gap-4">
        <div className="p-2 bg-kve-indigo/10 text-kve-indigo rounded">
          <History size={16} />
        </div>
        <div>
          <p className="text-xs font-bold text-white uppercase tracking-widest">Snapshot Topology</p>
          <p className="text-[10px] text-slate-500 mt-1">Hierarchical visualization of VM states. Rollback will return all disks to exact previous state.</p>
        </div>
      </div>
    </div>
  );
};

export default SnapshotsView;
