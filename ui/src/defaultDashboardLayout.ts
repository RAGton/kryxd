import { DashboardLayout } from './types/dashboard';

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  widgets: [
    { id: 'cpu', type: 'cpu', title: 'Uso de CPU', isVisible: true },
    { id: 'memory', type: 'memory', title: 'Uso de Memória', isVisible: true },
    { id: 'clients', type: 'clients', title: 'Clientes Online', isVisible: true },
    { id: 'services', type: 'services', title: 'Saúde dos Serviços', isVisible: true },
    { id: 'generations', type: 'generations', title: 'Gerações Publicadas', isVisible: true },
    { id: 'alerts', type: 'alerts', title: 'Alertas', isVisible: true },
    { id: 'storage', type: 'storage', title: 'Uso de Storage', isVisible: true },
  ],
  grid: [
    { i: 'cpu', x: 0, y: 0, w: 4, h: 2 },
    { i: 'memory', x: 4, y: 0, w: 4, h: 2 },
    { i: 'clients', x: 8, y: 0, w: 4, h: 2 },
    { i: 'services', x: 0, y: 2, w: 6, h: 3 },
    { i: 'generations', x: 6, y: 2, w: 6, h: 3 },
    { i: 'alerts', x: 0, y: 5, w: 8, h: 3 },
    { i: 'storage', x: 8, y: 5, w: 4, h: 3 },
  ]
};
