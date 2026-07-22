import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v2/console/host/ws`;
}

export default function TerminalConsole() {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState('Conectando…');

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#334155',
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);
    fit.fit();

    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      setStatus('Conectado');
      terminal.focus();
    };
    socket.onmessage = (event) => terminal.write(String(event.data));
    socket.onerror = () => setStatus('Falha na conexão');
    socket.onclose = () => setStatus('Desconectado');

    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });
    const resize = () => fit.fit();
    window.addEventListener('resize', resize);

    return () => {
      input.dispose();
      window.removeEventListener('resize', resize);
      socket.close();
      socketRef.current = null;
      terminal.dispose();
    };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-kve-accent">Ferramentas locais</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Terminal</h2>
          <p className="mt-2 text-sm text-slate-400">Sessão temporária com o usuário autenticado neste computador.</p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-mono text-slate-400">{status}</span>
      </div>
      <div ref={containerRef} className="h-[min(68vh,680px)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-2xl" aria-label="Terminal do host" />
      <p className="text-xs text-slate-500">A sessão termina quando esta tela for fechada ou a autenticação expirar.</p>
    </section>
  );
}
