import React from 'react';
import { WidgetType } from './types/dashboard';
import CpuWidget from './components/dashboard/CpuWidget';
import MemoryWidget from './components/dashboard/MemoryWidget';
import ClientsWidget from './components/dashboard/ClientsWidget';
import ServicesWidget from './components/dashboard/ServicesWidget';
import GenerationsWidget from './components/dashboard/GenerationsWidget';
import AlertsWidget from './components/dashboard/AlertsWidget';
import StorageWidget from './components/dashboard/StorageWidget';

export const WIDGET_REGISTRY: Record<WidgetType, React.FC> = {
  cpu: CpuWidget,
  memory: MemoryWidget,
  clients: ClientsWidget,
  services: ServicesWidget,
  generations: GenerationsWidget,
  alerts: AlertsWidget,
  storage: StorageWidget,
};
