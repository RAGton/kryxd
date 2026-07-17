import React from 'react';
import { Plus, Monitor, Activity, Users, Server, Zap, Bell, Database } from 'lucide-react';
import Modal from '../Modal';
import { DashboardWidget, WidgetType } from '../../types/dashboard';

interface WidgetPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (id: string) => void;
  availableWidgets: DashboardWidget[];
}

const WIDGET_ICONS: Record<WidgetType, any> = {
  cpu: Activity,
  memory: Monitor,
  clients: Users,
  services: Server,
  generations: Zap,
  alerts: Bell,
  storage: Database,
};

const WidgetPicker: React.FC<WidgetPickerProps> = ({ isOpen, onClose, onAdd, availableWidgets }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar Widget"
      type="info"
    >
      <div className="grid grid-cols-1 gap-3 mt-4">
        {availableWidgets.map((w) => {
          const Icon = WIDGET_ICONS[w.type];
          return (
            <button
              key={w.id}
              onClick={() => {
                onAdd(w.id);
                onClose();
              }}
              className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-kve-border hover:border-kve-accent/50 hover:bg-kve-accent/5 transition-all text-left group"
            >
              <div className="p-3 bg-slate-800 rounded-lg text-slate-400 group-hover:text-kve-accent transition-colors">
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white uppercase tracking-tight">{w.title}</p>
                <p className="text-xs text-slate-500 mt-1">Clique para adicionar ao painel</p>
              </div>
              <Plus size={16} className="text-slate-600 group-hover:text-kve-accent" />
            </button>
          );
        })}
        {availableWidgets.length === 0 && (
          <p className="text-center py-8 text-slate-500 text-sm italic">
            Todos os widgets já estão no painel.
          </p>
        )}
      </div>
    </Modal>
  );
};

export default WidgetPicker;
