import { useEffect, useState } from 'react';
import { Cpu, Plus, Play, Square, Box } from 'lucide-react';
import { getVirtNodes } from '../../lib/api.js';
import VirtWizard from '../../components/VirtWizard.jsx';

export default function Virt() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const fetchInstances = () => {
    getVirtNodes()
      .then(data => {
        setInstances(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
          <Cpu size={24} className="text-kryonix-blue" />
          <h2 className="text-lg font-semibold">Motor de Virtualização Incus</h2>
        </div>
        <button 
          onClick={() => setShowWizard(true)}
          className="bg-kryonix-blue hover:bg-blue-600 text-white flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus size={18} /> Nova Instância
        </button>
      </div>

      {loading ? (
        <div className="text-text-muted">Carregando instâncias...</div>
      ) : error ? (
        <div className="text-danger">Erro ao carregar os dados de virtualização.</div>
      ) : instances.length === 0 ? (
        <div className="bg-bg-elevated border border-border-subtle rounded-xl p-10 flex flex-col items-center justify-center text-text-muted shadow-sm gap-4">
          <Box size={48} className="text-gray-300 dark:text-gray-600" />
          <p>Nenhum dado disponível. Não há containers ou VMs rodando.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-bg-elevated border border-border-subtle rounded-xl shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-border-subtle text-text-secondary text-sm">
                <th className="p-4 font-semibold">Nome</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Tipo</th>
                <th className="p-4 font-semibold">IP (IPv4)</th>
                <th className="p-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-sm">
              {instances.map((inst, i) => {
                const isRunning = inst.status === 'Running' || inst.status === 'Running (Online)';
                return (
                  <tr key={inst.name || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                    <td className="p-4 font-medium text-text-primary flex items-center gap-2">
                      <Box size={16} className="text-kryonix-blue" />
                      {inst.name || 'Unnamed'}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isRunning ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-success' : 'bg-gray-400'}`}></span>
                        {inst.status || 'Stopped'}
                      </span>
                    </td>
                    <td className="p-4 text-text-muted">{inst.type || 'container'}</td>
                    <td className="p-4 font-mono text-text-muted">{inst.ipv4 || '-'}</td>
                    <td className="p-4 flex gap-2 justify-end">
                      {isRunning ? (
                        <button className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors" title="Parar">
                          <Square size={16} />
                        </button>
                      ) : (
                        <button className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors" title="Iniciar">
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

      {showWizard && (
        <VirtWizard 
          onClose={() => setShowWizard(false)} 
          onSuccess={() => {
            setShowWizard(false);
            setLoading(true);
            fetchInstances();
          }} 
        />
      )}
    </div>
  );
}
