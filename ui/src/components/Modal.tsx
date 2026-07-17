import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type?: 'info' | 'warning' | 'danger' | 'success';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, type = 'info', children, footer }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          
          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="glass w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl relative z-10 border border-kve-border"
          >
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-kve-border bg-slate-900/40">
              <div className="flex items-center gap-3">
                {type === 'warning' && <AlertTriangle className="text-kve-warning" size={20} />}
                {type === 'danger' && <AlertTriangle className="text-kve-danger" size={20} />}
                {type === 'success' && <CheckCircle2 className="text-kve-success" size={20} />}
                {type === 'info' && <Info className="text-kve-accent" size={20} />}
                <h3 className="text-sm font-bold text-white tracking-tight uppercase tracking-widest">{title}</h3>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-slate-800 transition-colors text-slate-500 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 text-slate-300 text-sm leading-relaxed">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 bg-slate-900/40 border-t border-kve-border flex items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
