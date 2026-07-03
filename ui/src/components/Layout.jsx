import Background3D from './Background3D';
import MockModeBanner from './MockModeBanner';
import EagleLogo from './EagleLogo';

export default function Layout({
  title,
  subtitle,
  phases = [],
  currentStepIndex = 0,
  onStepJump,
  children,
  footer,
}) {
  return (
    <div className="shell relative bg-bg-light text-slate-900 dark:bg-bg dark:text-text-primary h-screen w-screen overflow-hidden flex flex-col font-sans transition-colors duration-300">
      <Background3D />
      <MockModeBanner />
      
      {/* Modern Shell Layout (macOS / Arc style) */}
      <div className="flex-1 flex overflow-hidden z-10 p-4 md:p-8 relative">
        <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col bg-bg-light-glass dark:bg-bg-glass backdrop-blur-2xl border border-slate-200/50 dark:border-white/5 rounded-2xl shadow-panel overflow-hidden transition-all duration-300">
          
          {/* Top Navbar / Stepper */}
          <header className="flex-none bg-transparent border-b border-slate-200/50 dark:border-white/5 px-6 py-4 flex items-center justify-between">
            <h1 className="text-slate-900 dark:text-text-primary font-bold tracking-widest text-base flex gap-3 items-center">
              <EagleLogo className="w-10 h-10" /> KRYONIX <span className="text-slate-500 dark:text-text-secondary font-medium text-xs tracking-normal">Installer</span>
            </h1>
            
            <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar" aria-label="Fases da Instalação">
              {phases.map((phase, index) => {
                const isDone = phase.status === 'done';
                const isCurrent = phase.status === 'current';
                const targetIndex = phase.targetStepIndex;
                const canJump = isDone || targetIndex <= currentStepIndex;

                return (
                  <button
                    key={phase.id}
                    title={phase.title}
                    type="button"
                    className={`flex items-center px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 gap-2 ${
                      isCurrent 
                        ? 'bg-accent-blue text-white shadow-md ring-2 ring-accent-blue/30' 
                        : isDone 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-success/20 dark:text-success hover:bg-emerald-200 dark:hover:bg-success/30' 
                          : 'bg-black/10 backdrop-blur-md text-slate-500 dark:bg-white/5 dark:text-text3'
                    }`}
                    onClick={() => canJump && onStepJump?.(targetIndex)}
                    disabled={!canJump || !onStepJump}
                  >
                    <span className="opacity-80 font-normal">{index + 1}.</span> {phase.title}
                  </button>
                );
              })}
            </nav>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative">
            {/* Context Header */}
            {(title || subtitle) && (
              <div className="shrink-0 px-8 pt-8 pb-4">
                {title && <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">{title}</h2>}
                {subtitle && <p className="text-slate-500 dark:text-text2 text-sm max-w-2xl">{subtitle}</p>}
              </div>
            )}
            
            {/* Work Area */}
            <div className="flex-1 px-8 pb-8 overflow-hidden flex flex-col relative min-h-0">
              <div className="flex-1 overflow-hidden flex flex-col">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>

      {footer && (
        <div className="z-20 relative bg-white dark:bg-bg2 border-t border-slate-200 dark:border-border">
          {footer}
        </div>
      )}
    </div>
  );
}
