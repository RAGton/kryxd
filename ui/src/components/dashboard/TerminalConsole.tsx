import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal, Maximize2, Trash2, Power } from 'lucide-react';
import { motion } from 'motion/react';

interface TerminalConsoleProps {
  nodeId: string;
  nodeName: string;
}

const TerminalConsole: React.FC<TerminalConsoleProps> = ({ nodeId, nodeName }) => {
  const [history, setHistory] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const normalizedId = nodeId.replace(/^(vm|ct|qemu|lxc)-/, '');
    return `${protocol}//${window.location.host}/api/v2/virt/instances/${encodeURIComponent(normalizedId)}/console/ws`;
  }, [nodeId]);

  useEffect(() => {
    setConnected(false);
    setHistory([
      `KVE console proxy :: ${nodeName}`,
      `endpoint: ${wsUrl.replace(/^wss?:\/\/[^/]+/, '')}`,
      'connecting to Axum → Incus Unix Socket...',
    ]);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setHistory((current) => [...current, 'connected.']);
    };

    ws.onmessage = (event) => {
      setHistory((current) => [...current, String(event.data)]);
    };

    ws.onerror = () => {
      setHistory((current) => [...current, 'console proxy unavailable.']);
    };

    ws.onclose = () => {
      setConnected(false);
      setHistory((current) => [...current, 'console disconnected.']);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [nodeName, wsUrl]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setHistory((current) => [...current, `root@${nodeName}:~# ${input}`]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(`${input}\n`);
    } else {
      setHistory((current) => [...current, 'console proxy is not connected; command not sent.']);
    }
    setInput('');
  };

  return (
    <div className="flex flex-col h-[600px] bg-black border border-kve-border rounded-xl overflow-hidden shadow-2xl font-mono">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-kve-border">
        <div className="flex items-center gap-2">
          <Terminal size={14} className={connected ? 'text-kve-success' : 'text-kve-warning'} />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
            Console: {nodeName} ({nodeId})
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-slate-500 hover:text-white transition-colors" type="button">
            <Maximize2 size={14} />
          </button>
          <button
            onClick={() => setHistory([`KVE console proxy :: ${nodeName}`])}
            className="text-slate-500 hover:text-kve-danger transition-colors"
            type="button"
          >
            <Trash2 size={14} />
          </button>
          <button className="flex items-center gap-1 text-[10px] font-bold text-kve-warning border border-kve-warning/30 px-2 py-0.5 rounded hover:bg-kve-warning/10 transition-colors" type="button">
            <Power size={10} /> SIGNAL
          </button>
        </div>
      </div>

      <motion.div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 text-sm text-kve-success leading-relaxed custom-scrollbar selection:bg-kve-success selection:text-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="whitespace-pre-wrap mb-2">
          {history.map((line, i) => (
            <div key={`${line}-${i}`}>{line}</div>
          ))}
        </div>
        <form onSubmit={handleCommand} className="flex">
          <span className="text-kve-success mr-2 shrink-0">root@{nodeName}:~#</span>
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-kve-success focus:ring-0 p-0"
          />
        </form>
      </motion.div>

      <div className="px-4 py-1.5 bg-slate-900/50 border-t border-kve-border flex items-center justify-between">
        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
          WebSocket Proxy: /api/v2/virt/instances/:id/console/ws
        </div>
        <div className="flex gap-4 text-[10px] font-bold">
          <span className={connected ? 'text-kve-success' : 'text-kve-warning'}>{connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
          <span className="text-slate-400">AXUM → INCUS</span>
        </div>
      </div>
    </div>
  );
};

export default TerminalConsole;
