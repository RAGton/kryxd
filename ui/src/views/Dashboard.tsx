import React, { useState } from 'react';
import { 
  Plus, 
  Edit3, 
  Save, 
  X, 
  RotateCcw
} from 'lucide-react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import { motion } from 'motion/react';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { WIDGET_REGISTRY } from '../widgetRegistry';
import WidgetWrapper from '../components/dashboard/WidgetWrapper';
import WidgetPicker from '../components/dashboard/WidgetPicker';

const ResponsiveGridLayout = WidthProvider(Responsive);

const DashboardView: React.FC = () => {
  const {
    layout,
    isEditMode,
    saveLayout,
    resetLayout,
    toggleEditMode,
    setWidgetVisibility,
    onLayoutChange,
  } = useDashboardLayout();

  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const visibleWidgets = layout.widgets.filter(w => w.isVisible);
  const hiddenWidgets = layout.widgets.filter(w => !w.isVisible);

  const handleAddWidget = (id: string) => {
    setWidgetVisibility(id, true);
  };

  const handleRemoveWidget = (id: string) => {
    setWidgetVisibility(id, false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 min-h-screen pb-20"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">KRYONIX VE Control Center</h2>
          <p className="text-slate-500 text-sm">Painel de controle de infraestrutura</p>
        </div>
        <div className="flex items-center gap-3">
          {isEditMode ? (
            <>
              <button 
                onClick={() => setIsPickerOpen(true)}
                className="px-4 py-2 rounded-lg bg-kve-accent/10 border border-kve-accent/30 text-kve-accent font-bold text-xs flex items-center gap-2 hover:bg-kve-accent/20 transition-all"
              >
                <Plus size={16} /> ADICIONAR WIDGET
              </button>
              <button 
                onClick={resetLayout}
                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 font-bold text-xs flex items-center gap-2 hover:text-white transition-all"
                title="Restaurar padrão"
              >
                <RotateCcw size={16} />
              </button>
              <button 
                onClick={() => saveLayout()}
                className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
              >
                <Save size={16} /> SALVAR
              </button>
              <button 
                onClick={toggleEditMode}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </>
          ) : (
            <button 
              onClick={toggleEditMode}
              className="px-4 py-2 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
            >
              <Edit3 size={16} /> Editar Painel
            </button>
          )}
        </div>
      </div>

      <div className={isEditMode ? "technical-grid rounded-3xl p-4 border border-kve-accent/10" : ""}>
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout.grid }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={100}
          isDraggable={isEditMode}
          isResizable={isEditMode}
          draggableHandle=".drag-handle"
          onLayoutChange={(currentLayout) => onLayoutChange(currentLayout)}
          margin={[24, 24]}
        >
          {visibleWidgets.map((widget) => {
            const WidgetComponent = WIDGET_REGISTRY[widget.type];
            return (
              <div key={widget.id}>
                <WidgetWrapper
                  id={widget.id}
                  title={widget.title}
                  isEditMode={isEditMode}
                  onRemove={handleRemoveWidget}
                >
                  <WidgetComponent />
                </WidgetWrapper>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      </div>

      <WidgetPicker 
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onAdd={handleAddWidget}
        availableWidgets={hiddenWidgets}
      />
    </motion.div>
  );
};

export default DashboardView;
