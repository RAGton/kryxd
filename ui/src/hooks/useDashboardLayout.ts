import { useState, useEffect, useCallback } from 'react';
import { Layout } from 'react-grid-layout';
import { DashboardLayout, DashboardWidget, WidgetType } from '../types/dashboard';
import { DEFAULT_DASHBOARD_LAYOUT } from '../defaultDashboardLayout';

const STORAGE_KEY = 'kve_dashboard_layout';

export const useDashboardLayout = () => {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_DASHBOARD_LAYOUT);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validate parsed object to ensure it has required structure
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.widgets) && Array.isArray(parsed.grid)) {
          setLayout(parsed);
        } else {
          console.warn('Saved layout format is invalid, using default');
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.error('Failed to parse saved layout', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const saveLayout = useCallback((newGrid?: Layout) => {
    const updatedLayout = {
      ...layout,
      grid: newGrid || layout.grid,
    };
    setLayout(updatedLayout);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLayout));
    setIsEditMode(false);
  }, [layout]);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_DASHBOARD_LAYOUT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DASHBOARD_LAYOUT));
  }, []);

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  const setWidgetVisibility = useCallback((id: string, isVisible: boolean) => {
    setLayout(prev => {
      const updatedWidgets = prev.widgets.map(w => 
        w.id === id ? { ...w, isVisible } : w
      );
      return { ...prev, widgets: updatedWidgets };
    });
  }, []);

  const onLayoutChange = useCallback((newGrid: Layout) => {
    if (isEditMode) {
      setLayout(prev => ({ ...prev, grid: newGrid }));
    }
  }, [isEditMode]);

  return {
    layout,
    isEditMode,
    saveLayout,
    resetLayout,
    toggleEditMode,
    setWidgetVisibility,
    onLayoutChange,
  };
};
