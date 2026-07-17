import React from 'react';
import { Play, Square, RotateCcw, Monitor, Trash2, Settings, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ContextMenuProps {
  x: number;
  y: number;
  node: { id: string, type: string, label: string };
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, node, onClose }) => {
  const isVm = node.type === 'qemu' || node.type === 'lxc';

  const menuItems = isVm ? [
    { label: 'Start', icon: Play, color: 'text-kve-success' },
    { label: 'Shutdown', icon: Square, color: 'text-kve-danger' },
    { label: 'Reboot', icon: RotateCcw, color: 'text-kve-warning' },
    { label: 'Stop', icon: Trash2, color: 'text-kve-danger' },
    { divider: true },
    { label: 'Console', icon: Monitor },
    { label: 'Clone', icon: Copy },
    { label: 'Delete', icon: Trash2 },
  ] : [
    { label: 'Summary', icon: Monitor },
    { label: 'Config', icon: Settings },
    { label: 'Shell', icon: Monitor },
  ];

  return (
    <>
      <div 
        className="fixed inset-0 z-[1000]" 
        onClick={onClose} 
        onContextMenu={(e) => { e.preventDefault(); onClose(); }} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ top: y, left: x }}
        className="fixed z-[1001] w-48 bg-slate-900/95 backdrop-blur-xl border border-kve-border rounded-lg shadow-2xl py-1"
      >
        <div className="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-kve-border/50 mb-1">
          {node.label}
        </div>
        {menuItems.map((item, i) => (
          item.divider ? (
            <div key={i} className="my-1 border-t border-kve-border/30" />
          ) : (
            <button
              key={i}
              className="w-full flex items-center gap-3 px-3 py-1.5 text-xs text-slate-300 hover:bg-kve-accent/10 hover:text-white transition-colors"
              onClick={() => {
                console.log(`Action ${item.label} on ${node.id}`);
                onClose();
              }}
            >
              {item.icon && <item.icon size={14} className={item.color || 'text-slate-500'} />}
              <span>{item.label}</span>
            </button>
          )
        ))}
      </motion.div>
    </>
  );
};

export default ContextMenu;
