import { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export default function KcpTerminal() {
  const { nodeId, vmId, ctId } = useParams();
  const terminalRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);

  const instanceId = vmId || ctId;
  const instanceKind = ctId ? 'ct' : 'vm';

  const wsUrl = useMemo(() => {
    if (!instanceId) return null;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    if (nodeId) params.set('node', nodeId);
    params.set('kind', instanceKind);

    const query = params.toString();
    return `${protocol}//${window.location.host}/api/v2/virt/instances/${encodeURIComponent(instanceId)}/console/ws${query ? `?${query}` : ''}`;
  }, [instanceId, instanceKind, nodeId]);

  useEffect(() => {
    if (!terminalRef.current || !instanceId || !wsUrl) return undefined;

    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: '#000000',
        foreground: '#e5e7eb',
        cursor: '#3b82f6',
        selectionBackground: '#3b82f640',
        black: '#111827',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e5e7eb',
        brightBlack: '#374151',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#d8b4fe',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
    });

    termRef.current = term;
    fitAddonRef.current = new FitAddon();
    term.loadAddon(fitAddonRef.current);
    term.open(terminalRef.current);
    fitAddonRef.current.fit();

    term.writeln(`\x1b[36mKVE Console\x1b[0m - ${instanceKind.toUpperCase()} \x1b[33m${instanceId}\x1b[0m on node \x1b[33m${nodeId || 'local'}\x1b[0m`);
    term.writeln(`\x1b[90m${wsUrl.replace(window.location.origin.replace(/^http/, 'ws'), '')}\x1b[0m`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln('\x1b[32mConnected to Axum console proxy.\x1b[0m');
      term.writeln('');
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onclose = () => {
      term.writeln('\x1b[31mConsole disconnected.\x1b[0m');
    };

    ws.onerror = () => {
      term.writeln('\x1b[31mConsole proxy unavailable.\x1b[0m');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      term.dispose();
      wsRef.current = null;
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [instanceId, instanceKind, nodeId, wsUrl]);

  if (!instanceId) {
    return (
      <div className="flex h-[calc(100vh-12rem)] w-full items-center justify-center rounded-b-lg border border-slate-800 bg-black p-2 text-sm text-slate-500">
        Nenhuma instância selecionada para console.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[420px] w-full flex-col overflow-hidden rounded-b-lg border border-slate-800 bg-black p-2">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Console</span>
          <span className="font-mono text-blue-400">{instanceId}</span>
          <span className="rounded border border-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{instanceKind}</span>
        </div>
        <span className="text-xs text-slate-600">Axum → Incus Unix Socket</span>
      </div>
      <div ref={terminalRef} className="min-h-0 flex-1 overflow-hidden p-2" />
    </div>
  );
}