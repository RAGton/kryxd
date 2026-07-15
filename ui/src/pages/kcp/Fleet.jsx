import { useEffect, useState } from 'react';
import { Server, Activity } from 'lucide-react';
import { getFleetStatus } from '../../lib/api.js';

export default function Fleet() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getFleetStatus()
      .then(data => {
        setNodes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-text-muted">Carregando frota...</div>;
  }

  if (error) {
    return <div className="text-danger">Erro ao carregar os dados da frota.</div>;
  }

  if (nodes.length === 0) {
    return <div className="text-text-muted text-center py-10">Nenhum dado disponível. A frota está vazia.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {nodes.map((node, i) => {
        const isOnline = node.status === 'Healthy' || node.status === 'Online';
        return (
          <div key={node.uuid || i} className="bg-kryonix-dark rounded-xl border border-gray-800 p-6 flex flex-col gap-4 text-white shadow-panel">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Server size={24} className="text-kryonix-blue" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{node.uuid || 'Nó Desconhecido'}</h3>
                  <div className="text-xs text-gray-400 font-mono mt-1">{node.flake_revision?.substring(0,7) || 'N/A'}</div>
                </div>
              </div>
              <div className="relative flex h-3 w-3 mt-2">
                {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-success' : 'bg-danger'}`}></span>
              </div>
            </div>
            
            <div className="border-t border-gray-800 mt-2 pt-4 flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 flex items-center gap-1"><Activity size={14} /> Status</span>
                <span className={isOnline ? 'text-success' : 'text-danger'}>{node.status || 'Offline'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Último Heartbeat</span>
                <span className="text-gray-200">{node.timestamp ? new Date(node.timestamp).toLocaleString() : 'N/A'}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
