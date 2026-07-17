import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, PlayCircle, CheckCircle2, AlertTriangle, Terminal } from 'lucide-react';

interface Task {
  id: string;
  startTime: number;
  endTime: number | null;
  node: string;
  user: string;
  description: string;
  status: string;
}

interface TaskDetailModalProps {
  task: Task | null;
  onClose: () => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose }) => {
  if (!task) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-3xl bg-slate-900 border border-kve-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-kve-border flex items-center justify-between bg-slate-950/50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${task.status === 'OK' ? 'bg-kve-success/10 text-kve-success' : 'bg-kve-warning/10 text-kve-warning'}`}>
                {task.status === 'OK' ? <CheckCircle2 size={20} /> : <PlayCircle size={20} />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-tight">{task.description}</h3>
                <p className="text-[10px] text-slate-500 font-mono italic uppercase">{task.id}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Info Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-kve-border">
            <div className="bg-slate-900 px-6 py-3">
              <p className="text-[9px] font-bold text-slate-500 uppercase">Node</p>
              <p className="text-xs text-white font-mono">{task.node}</p>
            </div>
            <div className="bg-slate-900 px-6 py-3">
              <p className="text-[9px] font-bold text-slate-500 uppercase">User</p>
              <p className="text-xs text-white font-mono">{task.user}</p>
            </div>
            <div className="bg-slate-900 px-6 py-3">
              <p className="text-[9px] font-bold text-slate-500 uppercase">Start Time</p>
              <p className="text-xs text-white font-mono">{new Date(task.startTime).toLocaleTimeString()}</p>
            </div>
            <div className="bg-slate-900 px-6 py-3">
              <p className="text-[9px] font-bold text-slate-500 uppercase">Status</p>
              <p className={`text-xs font-bold uppercase ${task.status === 'OK' ? 'text-kve-success' : 'text-kve-warning'}`}>{task.status}</p>
            </div>
          </div>

          {/* Log Output Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-black/40 font-mono text-xs">
             <div className="flex items-center gap-2 text-slate-500 mb-4 pb-2 border-b border-kve-border/20">
               <Terminal size={14} />
               <span className="uppercase text-[10px] font-bold tracking-widest text-slate-600">Standard Output (Log)</span>
             </div>
             
             <div className="space-y-1">
                <p className="text-slate-500">[{new Date(task.startTime).toISOString()}] INFO: Starting task {task.id}</p>
                <p className="text-slate-500">[{new Date(task.startTime + 1000).toISOString()}] INFO: Validating cluster health...</p>
                <p className="text-kve-success">[{new Date(task.startTime + 2000).toISOString()}] OK: Cluster healthy.</p>
                <p className="text-slate-500">[{new Date(task.startTime + 5000).toISOString()}] INFO: Initializing {task.description} module.</p>
                <p className="text-slate-400">[{new Date(task.startTime + 10000).toISOString()}] Running sub-process (PID 4422)...</p>
                <p className="text-slate-300 ml-4">Processing blocks: 10%... 40%... 75%... 100%</p>
                <p className="text-kve-success">[{new Date(task.startTime + 25000).toISOString()}] SUCCESS: Sub-process completed.</p>
                <p className="text-slate-500">[{new Date(task.startTime + 30000).toISOString()}] INFO: Cleanup started.</p>
                <p className="text-kve-success font-bold mt-4 animate-in fade-in slide-in-from-bottom-2">TASK COMPLETED SUCCESSFULLY</p>
             </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-kve-border bg-slate-950/50 flex justify-end gap-3">
             <button className="px-4 py-2 text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-widest" onClick={onClose}>
                Close
             </button>
             <button className="px-4 py-2 bg-slate-800 text-white text-[10px] font-bold rounded border border-slate-700 hover:bg-slate-700 transition-all uppercase tracking-widest flex items-center gap-2">
                <Download size={14} className="text-slate-500" /> Download Log
             </button>
             <button className="px-4 py-2 bg-kve-accent text-kve-bg text-[10px] font-bold rounded hover:bg-kve-accent/90 transition-all uppercase tracking-widest">
                Re-Run Task
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const Download = ({ size, className }: { size: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);

export default TaskDetailModal;
