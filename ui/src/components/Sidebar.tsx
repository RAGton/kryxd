import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Database, 
  Monitor, 
  UploadCloud, 
  Settings, 
  ShieldAlert, 
  Activity, 
  Network, 
  FileText, 
  Server,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Box,
  Cpu,
  HardDrive,
  Globe,
  Layers,
  Terminal,
  Zap
} from 'lucide-react';
import { ViewType, ResourceTreeNode } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ContextMenu from './ContextMenu';
import logoImg from '../assets/logo.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onResourceSelect: (resource: {id: string, type: any, label: string}) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  thinkServerActive?: boolean;
  setThinkServerActive?: (active: boolean) => void;
}

const ResourceTree: React.FC<{
  node: ResourceTreeNode;
  depth: number;
  onSelect: (node: ResourceTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: ResourceTreeNode) => void;
  selectedId?: string;
}> = ({ node, depth, onSelect, onContextMenu, selectedId }) => {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const getIcon = (type: string) => {
    switch (type) {
      case 'datacenter': return <ShieldAlert size={14} className="text-kve-accent" />;
      case 'node': return <Server size={14} className="text-kve-success" />;
      case 'lxc': return <Box size={14} className="text-kve-indigo" />;
      case 'qemu': return <Cpu size={14} className="text-kve-warning" />;
      case 'storage': return <Database size={14} className="text-slate-400" />;
      default: return <HardDrive size={14} />;
    }
  };

  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-2 py-1 px-2 cursor-pointer rounded-sm text-xs transition-colors",
          selectedId === node.id ? "bg-kve-accent/20 text-kve-accent" : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (hasChildren) setIsOpen(!isOpen);
          onSelect(node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, node);
        }}
      >
        {hasChildren ? (
          <ChevronDown size={12} className={cn("transition-transform", !isOpen && "-rotate-90")} />
        ) : (
          <div className="w-3" />
        )}
        {getIcon(node.type)}
        <span className="truncate">{node.label}</span>
        {node.status && (
          <div className={cn(
            "w-1.5 h-1.5 rounded-full ml-auto",
            node.status === 'online' || node.status === 'running' ? "bg-kve-success" : "bg-kve-danger"
          )} />
        )}
      </div>
      {hasChildren && isOpen && (
        <div className="mt-0.5">
          {node.children!.map(child => (
            <ResourceTree 
              key={child.id} 
              node={child} 
              depth={depth + 1} 
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange, 
  onResourceSelect, 
  collapsed, 
  setCollapsed,
  thinkServerActive = false,
  setThinkServerActive
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('dc-01');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: any } | null>(null);

  const resourceTree: ResourceTreeNode = {
    id: 'dc-01',
    type: 'datacenter',
    label: 'Datacenter',
    children: [
      {
        id: 'node-01',
        type: 'node',
        label: 'kve-primary',
        status: 'online',
        children: [
          { id: 'vm-101', type: 'qemu', label: '101 (web-prod)', status: 'running' },
          { id: 'vm-102', type: 'qemu', label: '102 (db-master)', status: 'running' },
          { id: 'vm-103', type: 'lxc', label: '103 (monitoring)', status: 'running' },
          { id: 'storage-01', type: 'storage', label: 'local-lvm' },
        ]
      },
      {
        id: 'node-02',
        type: 'node',
        label: 'kve-backup',
        status: 'online',
        children: [
          { id: 'vm-201', type: 'lxc', label: '201 (rsync-agent)', status: 'stopped' },
          { id: 'storage-02', type: 'storage', label: 'backup-zfs' },
        ]
      }
    ]
  };

  const netbootTree: ResourceTreeNode = {
    id: 'ts-01',
    type: 'datacenter',
    label: 'Node Server Cluster',
    children: [
      {
        id: 'ts-pxe-images',
        type: 'node',
        label: 'Imagens PXE / Boot',
        status: 'online',
        children: [
          { id: 'ts-img-1', type: 'lxc', label: 'NixOS-Thin-Client-v2.6', status: 'running' },
          { id: 'ts-img-2', type: 'lxc', label: 'KVE-Rescue-Shell-v1.4', status: 'running' },
          { id: 'ts-img-3', type: 'lxc', label: 'Alpine-Diskless-KVE-v3.19', status: 'stopped' },
        ]
      },
      {
        id: 'ts-fleet',
        type: 'node',
        label: 'Terminais Diskless',
        status: 'online',
        children: [
          { id: 'ts-dev-1', type: 'qemu', label: 'thin-client-01', status: 'running' },
          { id: 'ts-dev-2', type: 'qemu', label: 'thin-client-02', status: 'running' },
          { id: 'ts-dev-3', type: 'qemu', label: 'lab-pc-01 (LIGANDO...)', status: 'stopped' },
          { id: 'ts-dev-4', type: 'qemu', label: 'lab-pc-02', status: 'stopped' },
        ]
      }
    ]
  };

  const handleNodeSelect = (node: ResourceTreeNode) => {
    setSelectedNodeId(node.id);
    
    if (thinkServerActive) {
      // If we are in Node Server Panel, any node click can refresh/redirect to the Node Server view
      onViewChange('node-server');
      onResourceSelect({ id: node.id, type: node.type, label: node.label });
      return;
    }

    onResourceSelect({ id: node.id, type: node.type, label: node.label });
    
    switch (node.type) {
      case 'datacenter': onViewChange('datacenter'); break;
      case 'node': onViewChange('nodes'); break;
      case 'lxc': onViewChange('lxc'); break;
      case 'qemu': onViewChange('qemu'); break;
      default: onViewChange('dashboard');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: ResourceTreeNode) => {
    if (thinkServerActive) return; // disable context menu for PXE tree
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node: { id: node.id, type: node.type, label: node.label }
    });
  };

  const menuItems = [
    { id: 'dashboard', label: 'Resumo', icon: LayoutDashboard },
    { id: 'users', label: 'Usuários', icon: Users },
    { id: 'storage', label: 'Storage', icon: Database },
    { id: 'logs', label: 'Logs', icon: FileText },
    { id: 'api-hub', label: 'Contratos API', icon: Network },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const currentActiveTree = thinkServerActive ? netbootTree : resourceTree;

  return (
    <aside className={cn(
      "glass h-screen flex flex-col transition-all duration-300 z-50",
      collapsed ? "w-14" : "w-64"
    )}>
      <div className="p-4 flex items-center justify-between border-b border-kve-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center transition-colors overflow-hidden bg-transparent">
              <img src={logoImg} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white uppercase italic">
              {thinkServerActive ? (
                <>KRYONIX <span className="text-kve-accent font-bold">NODE</span></>
              ) : (
                <>KRYONIX <span className="text-[10px] font-normal text-slate-500">NODE</span></>
              )}
            </span>
          </div>
        )}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-slate-800 transition-colors text-slate-400 hover:text-white mx-auto"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Resource Tree */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto py-2 custom-scrollbar border-b border-kve-border border-opacity-30">
            <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">
              {thinkServerActive ? 'Infra Centralizada' : 'Recursos'}
            </h3>
            <ResourceTree 
              node={currentActiveTree} 
              depth={0} 
              onSelect={handleNodeSelect} 
              onContextMenu={handleContextMenu}
              selectedId={selectedNodeId}
            />
          </div>
        )}

        {contextMenu && (
          <ContextMenu 
            x={contextMenu.x} 
            y={contextMenu.y} 
            node={contextMenu.node} 
            onClose={() => setContextMenu(null)} 
          />
        )}

        {/* Flat Menu */}
        <nav className="py-4 px-2 space-y-1">
          {!collapsed && (
            <h3 className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">
              Gerenciamento
            </h3>
          )}
          
          {/* Node Server tab shortcut if active */}
          {thinkServerActive && (
            <button
              onClick={() => onViewChange('node-server')}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-1.5 rounded transition-all duration-200 group relative",
                currentView === 'node-server' 
                  ? "bg-kve-accent/10 text-kve-accent" 
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <Monitor size={18} className="text-kve-accent" />
              {!collapsed && <span className="text-xs font-bold">Terminal PXE</span>}
              {currentView === 'node-server' && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-kve-accent rounded-r-full" />
              )}
            </button>
          )}

          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as ViewType)}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-1.5 rounded transition-all duration-200 group relative",
                currentView === item.id 
                  ? "bg-kve-accent/10 text-kve-accent" 
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <item.icon size={18} className={cn(
                "transition-transform duration-200",
                currentView === item.id ? "scale-105" : "group-hover:scale-105"
              )} />
              {!collapsed && <span className="text-xs font-medium">{item.label}</span>}
              {currentView === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-kve-accent rounded-r-full" />
              )}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
