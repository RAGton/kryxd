import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, HardDrive, Cpu, Settings } from 'lucide-react';

export default function DashboardLayout({ role }) {
  const isCore = role === 'Core' || role === 'ThinkServer';
  const location = useLocation();

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard Overview';
      case '/fleet': return 'Fleet Management';
      case '/storage': return 'ZFS Cotas';
      case '/virt': return 'Incus Virtualization';
      case '/local-settings': return 'Local Settings';
      default: return 'Kryonix Control Plane';
    }
  };

  return (
    <div className="flex h-screen bg-bg-elevated text-text-primary font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-kryonix-dark text-white flex flex-col shadow-panel z-10">
        <div className="p-5 flex items-center gap-3 font-bold text-lg border-b border-gray-800/50">
          <div className="w-8 h-8 rounded bg-kryonix-blue flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            K
          </div>
          <span className="tracking-wide">Control Plane</span>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-2">
            System
          </div>
          
          {isCore && (
            <>
              <NavLink to="/" end className={({isActive}) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-kryonix-blue text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                <LayoutDashboard size={20} /> Dashboard
              </NavLink>
              <NavLink to="/fleet" className={({isActive}) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-kryonix-blue text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                <Server size={20} /> Fleet
              </NavLink>
              <NavLink to="/storage" className={({isActive}) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-kryonix-blue text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                <HardDrive size={20} /> Storage
              </NavLink>
              <NavLink to="/virt" className={({isActive}) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-kryonix-blue text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                <Cpu size={20} /> Virtualization
              </NavLink>
            </>
          )}
          
          <NavLink to="/local-settings" className={({isActive}) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-kryonix-blue text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
            <Settings size={20} /> Local Settings
          </NavLink>
        </nav>

        <div className="p-4 border-t border-gray-800/50 text-xs text-gray-500 text-center">
          Role: <span className="text-kryonix-blue font-semibold">{role}</span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 border-b border-border-subtle bg-bg-surface flex items-center px-8 shadow-sm z-0">
          <h1 className="text-xl font-semibold text-text-primary">{getPageTitle()}</h1>
        </header>
        <div className="flex-1 p-8 overflow-auto bg-bg-light">
          <div className="animate-fade-in-up h-full">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
