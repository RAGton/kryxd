import { Layout } from 'react-grid-layout';

export type WidgetType = 
  | 'cpu' 
  | 'memory' 
  | 'clients' 
  | 'services' 
  | 'generations' 
  | 'alerts' 
  | 'storage';

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  isVisible: boolean;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
  grid: Layout;
}
