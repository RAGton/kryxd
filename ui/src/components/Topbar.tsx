import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Bell, 
  Globe, 
  Cpu, 
  Database, 
  Activity,
  Terminal,
  ShieldCheck,
  Zap,
  Box,
  Monitor,
  LogOut,
  Settings,
  Moon,
  ChevronDown
} from 'lucide-react';
import { ViewType } from '../types';
import SearchOverlay from './dashboard/SearchOverlay';

interface TopbarProps {
  currentView: ViewType;
  selectedResource?: {id: string, type: any, label: string};
  onResourceSelect?: (res: any) => void;
  thinkServerActive?: boolean;
  onThinkServerToggle?: () => void;
  onLogout?: () => void;
  desktopMode?: boolean;
  session?: { username?: string; real_name?: string; uid?: number; is_admin?: boolean };
}

const Topbar: React.FC<TopbarProps> = ({ 
  currentView, 
  selectedResource, 
  onResourceSelect,
  thinkServerActive = false,
  onThinkServerToggle,
  onLogout,
  desktopMode = false,
  session
}) => {
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isKveCluster, setIsKveCluster] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    // Read the operational scope to see if we should display the Think Server toggle
    const scope = localStorage.getItem('kve_operational_scope');
    setIsKveCluster(scope === 'cluster');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const viewLabels: Record<string, string> = {
    dashboard: 'Visão Geral',
    datacenter: 'Datacenter',
    nodes: 'Node Summary',
    lxc: 'Container View',
    qemu: 'Virtual Machine',
    users: 'Gestão de Usuários',
    quotas: 'Quotas de Storage',
    publish: 'Publish / Boot',
    services: 'Serviços do Sistema',
    storage: 'Storage / BTRFS',
    monitoring: 'Observabilidade',
    gateway: 'Gateway / Firewall',
    logs: 'Logs / Auditoria',
    settings: 'Configurações',
    'api-hub': 'Hub de Contratos de API',
    'node-server': 'Node Server'
  };

  return (
    <header className="glass h-16 flex items-center justify-between px-8 z-40 shrink-0 border-b border-kve-border/40">
      <div className="flex items-center gap-6">
        <div className="flex flex-col">
          <h1 className="text-lg font-bold text-white tracking-tight leading-tight uppercase italic flex items-center gap-2">
            {desktopMode ? 'Kryonix Control Center' : thinkServerActive && currentView === 'node-server' ? (
              <>
                <Monitor size={16} className="text-kve-accent" />
                Node Server
              </>
            ) : (
              selectedResource?.label || viewLabels[currentView]
            )}
          </h1>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            <Globe size={10} />
            <span>Kryonix Desktop</span>
            {selectedResource && !thinkServerActive && (
              <>
                <span className="text-slate-700">/</span>
                <span className="text-kve-accent">{selectedResource.type}</span>
                <span className="text-slate-700">/</span>
                <span>{selectedResource.id}</span>
              </>
            )}
            {thinkServerActive && (
              <>
                <span className="text-slate-700">/</span>
                <span className="text-kve-accent">Diskless Mode</span>
              </>
            )}
          </div>
        </div>

        {!desktopMode && (
          <div className="hidden lg:flex items-center gap-4 px-4 border-l border-kve-border">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-kve-success animate-pulse-soft" />
              <span className="text-xs font-mono text-slate-400">SYS: OK</span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-kve-accent" />
              <span className="text-xs font-mono text-slate-400">LOAD: 0.42</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        
        {/* Node Server Toggle Switch */}
        {onThinkServerToggle && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/40 rounded-xl border border-kve-border select-none">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <Monitor size={12} className={thinkServerActive ? "text-kve-accent animate-pulse-soft" : "text-slate-500"} />
              Node Server
            </div>
            <button
              onClick={onThinkServerToggle}
              id="think-server-panel-toggle"
              className={`w-10 h-5 rounded-full relative transition-all duration-300 ${
                thinkServerActive ? 'bg-kve-accent shadow-[0_0_12px_rgba(56,189,248,0.5)]' : 'bg-slate-800'
              }`}
              title={thinkServerActive ? "Desativar Node Server" : "Ativar Node Server"}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-300 ${
                thinkServerActive ? 'right-0.5' : 'left-0.5'
              }`} />
            </button>
          </div>
        )}

        <div 
          className="relative hidden md:block cursor-pointer group"
          onClick={() => setIsSearchOpen(true)}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-kve-accent transition-colors" size={16} />
          <div className="bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2 text-sm text-slate-500 w-64 transition-all group-hover:border-kve-accent/30">
             Buscar recursos...
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded border border-kve-border">
            /
          </div>
        </div>

        <div className="flex gap-1 border-r border-kve-border pr-2 mr-2 hidden xl:flex">
          <button 
            onClick={() => alert('O que devemos implementar aqui? (Ex: Modal de criação de Máquina Virtual)')}
            className="px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded uppercase tracking-widest hover:bg-kve-accent/90 transition-all flex items-center gap-2 group"
          >
            <Cpu size={12} className="group-hover:scale-110 transition-transform" /> Criar VM
          </button>
          <button 
            onClick={() => alert('O que devemos implementar aqui? (Ex: Modal de criação de Container LXC)')}
            className="px-3 py-1.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded border border-slate-700 uppercase tracking-widest hover:text-white transition-all flex items-center gap-2 group"
          >
            <Box size={12} className="group-hover:scale-110 transition-transform" /> Criar CT
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white relative">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-kve-danger rounded-full border-2 border-kve-bg" />
          </button>
          <button
            onClick={() => navigate('/desktop/terminal')}
            title="Abrir terminal do host"
            aria-label="Abrir terminal do host"
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          >
            <Terminal size={20} />
          </button>
          <button className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
            <ShieldCheck size={20} />
          </button>
          <div className="relative">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 ml-2 p-1 pr-2 rounded-lg hover:bg-slate-800 transition-colors border border-transparent hover:border-kve-border"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-white shrink-0 border border-kve-border">
                {(session?.real_name || session?.username || 'US').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-kve-border rounded-xl shadow-2xl py-2 z-50 overflow-hidden">
                  <div className="px-4 py-2 border-b border-kve-border/50 mb-2">
                    <p className="text-sm font-bold text-white truncate">{session?.real_name || session?.username || 'Usuário local'}</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate">@{session?.username || '—'} · UID {session?.uid ?? '—'}</p>
                  </div>
                  
                  <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
                    <Settings size={16} className="text-slate-500" />
                    <span>Preferências</span>
                  </button>
                  
                  <button 
                    onClick={() => alert('Troca de tema será implementada no futuro. O sistema opera nativamente no modo Dark.')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <Moon size={16} className="text-slate-500" />
                    <span>Alternar Tema</span>
                  </button>

                  <div className="h-px bg-kve-border/50 my-2" />
                  
                  <button 
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout?.();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={16} />
                    <span>Deslogar</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <SearchOverlay 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        onSelect={(res) => onResourceSelect?.(res)}
      />
    </header>
  );
};

export default Topbar;
