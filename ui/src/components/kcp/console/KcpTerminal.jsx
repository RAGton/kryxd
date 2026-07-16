import { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export default function KcpTerminal({ instanceName, onClose }) {
  const terminalRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e7eb',
        cursor: '#3b82f6',
        selection: '#3b82f640',
        black: '#1a1a1a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e5e7eb',
        brightBlack: '#2a2a2a',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#d8b4fe',
        brightCyan: '#22d3ee',
        brightWhite: '#fff',
      },
    });

    termRef.current = term;
    fitAddonRef.current = new FitAddon();
    term.loadAddon(fitAddonRef.current);

    // Open terminal in the div
    term.open(terminalRef.current);
    fitAddonRef.current.fit();

    // Welcome message
    term.writeln('\x1b[36mKCP Console\x1b[0m - Connecting to \x1b[33m' + instanceName + '\x1b[0m...');

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v2/console/instances/${instanceName}/console/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln('\x1b[32mConnected!\x1b[0m');
      term.writeln('');
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onclose = () => {
      term.writeln('\x1b[31mDisconnected\x1b[0m');
    };

    ws.onerror = (err) => {
      term.writeln('\x1b[31mError: ' + (err.message || 'Connection failed') + '\x1b[0m');
    };

    // Handle user input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    resizeObserver.observe(terminalRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [instanceName]);

  return (
    <div className="flex flex-col h-full bg-bg-elevated rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border-subtle bg-kryonix-dark">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">Console: </span>
          <span className="text-sm text-kryonix-blue font-mono">{instanceName}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
          title="Fechar Console"
        >
          ✕
        </button>
      </div>

      {/* Terminal */}
      <div 
        ref={terminalRef} 
        className="flex-1 p-2 overflow-hidden"
      />
    </div>
  );
}