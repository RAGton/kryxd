import { useState, useRef, useEffect } from 'react';

export default function AdvancedLogsDrawer({ logs, autoScroll = true, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, expanded]);

  return (
    <div className={`bg-bg-glass backdrop-blur-xl border border-border rounded-xl shadow-glass flex flex-col overflow-hidden transition-all duration-300 ${expanded ? 'h-96' : 'h-14'} ${className}`}>
      <button 
        onClick={() => setExpanded(!expanded)}
        className="h-14 px-6 flex items-center justify-between w-full hover:bg-black/5 backdrop-blur-md/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className={`w-5 h-5 text-primary transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="font-bold tracking-widest text-xs uppercase text-text2">
            {expanded ? 'Ocultar Terminal' : 'Mostrar Terminal de Logs'}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="w-2 h-2 rounded-full bg-danger"></span>
          <span className="w-2 h-2 rounded-full bg-warning"></span>
          <span className="w-2 h-2 rounded-full bg-success"></span>
        </div>
      </button>
      
      <div 
        ref={scrollRef}
        className={`flex-1 p-4 bg-term-bg overflow-y-auto font-mono text-[11px] leading-relaxed text-term-fg transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {logs || 'Aguardando logs...'}
      </div>
    </div>
  );
}
