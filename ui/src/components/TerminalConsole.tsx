import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v2/console/host/ws`;
}

type TerminalStatus = 'Conectando' | 'Pronto' | 'Falha' | 'Encerrado';
type TerminalServerMessage = {
  type?: 'ready' | 'error';
  username?: string;
  shell?: string;
  message?: string;
};

export default function TerminalConsole() {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('Conectando');
  const [statusMessage, setStatusMessage] = useState('Abrindo sessão segura…');
  const [username, setUsername] = useState('—');
  const [shell, setShell] = useState('—');

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      disableStdin: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      scrollback: 5000,
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
    terminalRef.current = terminal;
    fitRef.current = fit;

    const sendResize = () => {
      fit.fit();
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: 'resize',
        cols: terminal.cols,
        rows: terminal.rows,
      }));
    };

    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      setStatus('Conectando');
      setStatusMessage('Shell autorizado; negociando tamanho da PTY…');
      sendResize();
      terminal.focus();
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as TerminalServerMessage;
        if (message.type === 'ready') {
          setUsername(message.username || '—');
          setShell(message.shell || '—');
          setStatus('Pronto');
          setStatusMessage('Prompt ativo');
          terminal.focus();
          return;
        }
        if (message.type === 'error') {
          setStatus('Falha');
          setStatusMessage(message.message || 'Falha ao iniciar o terminal');
          terminal.write(`\r\n\x1b[31m[Terminal] ${message.message || 'Falha ao iniciar a sessão'}\x1b[0m\r\n`);
          return;
        }
      } catch {
        // Saída normal do shell não é JSON e deve ser enviada diretamente ao xterm.
      }
      terminal.write(event.data);
    };
    socket.onerror = () => {
      setStatus('Falha');
      setStatusMessage('Não foi possível conectar ao terminal');
    };
    socket.onclose = () => {
      setStatus('Encerrado');
      setStatusMessage('Conexão encerrada; reconecte para abrir uma nova sessão');
    };

    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data }));
      }
    });
    window.addEventListener('resize', sendResize);
    const observer = new ResizeObserver(sendResize);
    observer.observe(containerRef.current);

    return () => {
      input.dispose();
      observer.disconnect();
      window.removeEventListener('resize', sendResize);
      socket.close();
      socketRef.current = null;
      terminalRef.current = null;
      fitRef.current = null;
      terminal.dispose();
    };
  }, []);

  const statusClass = status === 'Pronto'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : status === 'Falha' || status === 'Encerrado'
      ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-300';

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-kve-accent">Ferramentas locais</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Terminal</h2>
          <p className="mt-2 text-sm text-slate-400">Sessão temporária com o usuário autenticado neste computador.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-mono ${statusClass}`}>{status}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs text-slate-400">
        <span>Usuário: <strong className="text-slate-200">{username}</strong></span>
        <span>Shell: <strong className="text-slate-200">{shell}</strong></span>
        <span className="ml-auto text-slate-500">{statusMessage}</span>
      </div>

      <div ref={containerRef} className="h-[min(68vh,680px)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-2xl" aria-label="Terminal do host" />
      <p className="text-xs text-slate-500">A sessão termina quando esta tela for fechada ou a autenticação expirar.</p>
    </section>
  );
}
