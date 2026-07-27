import { useEffect, useState } from 'react';
import { Cpu, Plus, Play, Square, Box, Terminal, RefreshCw, AlertTriangle } from 'lucide-react';
import { useKveSnapshot } from '../../lib/kve.js';
import VirtWizard from '../../components/VirtWizard.jsx';
import KcpTerminal from '../../components/kcp/console/KcpTerminal.jsx';

function HealthBadge({ health, status }) {
  if (status === 'unavailable') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-red-50 text-red-700 border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
        Incus indisponível
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-orange-50 text-orange-700 border-orange-200">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
        Falha de comunicação
      </span>
    );
  }
  if (health?.source) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
        {health.source} — {health.status}
      </span>
    );
  }
  return null;
}

export default function Virt() {
  const [showWizard, setShowWizard] = useState(false);
  const [consoleInstance, setConsoleInstance] = useState(null);
  const [refreshMs, setRefreshMs] = useState(0);
  const snapshot = useKveSnapshot({ refreshMs });

  const openConsole = (instanceName) => setConsoleInstance(instanceName);
  const closeConsole = () => setConsoleInstance(null);

  const refresh = () => {
    // force re-fetch by toggling refreshMs
    setRefreshMs((m) => (m === 0 ? 1 : 0));
    setTimeout(() => setRefreshMs(0), 50);
  };

  const isRunning = (state) =>
    state === 'Running' || state === 'Running (Online)';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
          <Cpu size={24} className="text-kryonix-blue" />
          <h2 className="text-lg font-semibold">Motor de Virtualização Incus</h2>
          <HealthBadge health={snapshot.health} status={snapshot.status} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="bg-bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowWizard(true)}
            disabled={snapshot.status === 'unavailable'}
            className="bg-kryonix-blue hover:bg-blue-600 text-white flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={18} /> Nova Instância
          </button>
        </div>
      </div>

      {snapshot.status === 'loading' && (
        <div className="text-text-muted">Carregando instâncias...</div>
      )}

      {snapshot.status === 'unavailable' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col gap-2 shadow-sm">
          <div className="flex items-center gap-2 text-red-700 font-medium">
            <AlertTriangle size={20} />
            Incus indisponível
          </div>
          <p className="text-sm text-red-600">
            O daemon kryxd reportou que o backend Incus não está acessível.
            Verifique se o serviço incus está rodando e se o socket Unix está disponível.
          </p>
          {snapshot.error?.payload?.message && (
            <pre className="text-xs bg-white border border-red-100 rounded p-2 mt-2 overflow-x-auto text-red-700">
              {snapshot.error.payload.message}
            </pre>
          )}
        </div>
      )}

      {snapshot.status === 'error' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 flex flex-col gap-2 shadow-sm">
          <div className="flex items-center gap-2 text-orange-700 font-medium">
            <AlertTriangle size={20} />
            Falha ao consultar kryxd
          </div>
          <p className="text-sm text-orange-600">
            {snapshot.error?.message || 'Erro desconhecido'}
          </p>
        </div>
      )}

      {(snapshot.status === 'ready' || snapshot.status === 'empty') && (
        <>
          {snapshot.instances.length === 0 ? (
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-10 flex flex-col items-center justify-center text-text-muted shadow-sm gap-4">
              <Box size={48} className="text-gray-300 dark:text-gray-600" />
              <p>Incus está saudável. Nenhum container ou VM em execução no momento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-bg-elevated border border-border-subtle rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-border-subtle text-text-secondary text-sm">
                    <th className="p-4 font-semibold">Nome</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold">Tipo</th>
                    <th className="p-4 font-semibold">IPv4</th>
                    <th className="p-4 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-sm">
                  {snapshot.instances.map((inst, i) => {
                    const running = isRunning(inst.state);
                    const ipv4 = Array.isArray(inst.ipv4)
                      ? inst.ipv4.join(', ')
                      : '';
                    return (
                      <tr
                        key={inst.name || i}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors"
                      >
                        <td className="p-4 font-medium text-text-primary flex items-center gap-2">
                          <Box size={16} className="text-kryonix-blue" />
                          {inst.name || 'Unnamed'}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                              running
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-success' : 'bg-gray-400'}`}
                            ></span>
                            {inst.state || 'Unknown'}
                          </span>
                        </td>
                        <td className="p-4 text-text-muted">
                          {inst.kind === 'virtual-machine' ? 'VM' : 'CT'}
                        </td>
                        <td className="p-4 font-mono text-text-muted">
                          {ipv4 || '—'}
                        </td>
                        <td className="p-4 flex gap-2 justify-end">
                          <button
                            onClick={() => openConsole(inst.name)}
                            className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Abrir Console"
                            disabled={!running}
                          >
                            <Terminal size={16} />
                          </button>
                          {running ? (
                            <button
                              className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              title="Parar"
                              disabled
                            >
                              <Square size={16} />
                            </button>
                          ) : (
                            <button
                              className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                              title="Iniciar"
                              disabled
                            >
                              <Play size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {snapshot.storage.length > 0 && (
            <div className="bg-bg-elevated border border-border-subtle rounded-xl shadow-sm p-6">
              <h3 className="text-md font-semibold mb-3">Storage Pools</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {snapshot.storage.map((pool) => (
                  <div
                    key={pool.name}
                    className="border border-border-subtle rounded-lg p-3 flex flex-col gap-1"
                  >
                    <div className="font-medium">{pool.name}</div>
                    <div className="text-xs text-text-muted">
                      driver: {pool.driver || '—'} · estado: {pool.state || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {consoleInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-bg-elevated border border-border-subtle shadow-panel rounded-xl w-[900px] h-[600px] flex flex-col">
            <KcpTerminal
              instanceName={consoleInstance}
              onClose={closeConsole}
            />
          </div>
        </div>
      )}

      {showWizard && (
        <VirtWizard
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            setShowWizard(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
