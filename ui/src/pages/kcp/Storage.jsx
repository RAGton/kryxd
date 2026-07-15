import { useEffect, useState } from 'react';
import { HardDrive, PieChart } from 'lucide-react';
import { getStorageQuotasi } from '../../lib/api.js';

function formatBytes(bytesStr) {
  if (!bytesStr || bytesStr === 'none') return 'N/A';
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes)) return bytesStr;
  
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function calculatePercent(usedStr, availableStr, quotaStr) {
  const used = parseInt(usedStr, 10);
  let total = 0;
  
  if (quotaStr && quotaStr !== 'none' && quotaStr !== '0') {
    total = parseInt(quotaStr, 10);
  } else {
    const available = parseInt(availableStr, 10) || 0;
    total = used + available;
  }
  
  if (isNaN(used) || isNaN(total) || total === 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

export default function Storage() {
  const [quotas, setQuotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getStorageQuotasi()
      .then(data => {
        setQuotas(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-text-muted">Carregando cotas...</div>;
  if (error) return <div className="text-danger">Erro ao carregar dados de storage.</div>;
  if (quotas.length === 0) return <div className="text-text-muted text-center py-10">Nenhum dado disponível. O storage está vazio.</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
        <PieChart size={24} className="text-kryonix-blue" />
        <h2 className="text-lg font-semibold">Cotas ZFS</h2>
      </div>

      <div className="flex flex-col gap-4">
        {quotas.map((q, i) => {
          const percent = calculatePercent(q.used, q.available, q.quota);
          const usedFormatted = formatBytes(q.used);
          let totalFormatted = 'Ilimitado';
          if (q.quota && q.quota !== 'none' && q.quota !== '0') {
            totalFormatted = formatBytes(q.quota);
          } else if (q.available) {
            const usedBytes = parseInt(q.used, 10) || 0;
            const availBytes = parseInt(q.available, 10) || 0;
            totalFormatted = formatBytes((usedBytes + availBytes).toString());
          }

          return (
            <div key={q.name || i} className="bg-bg-elevated border border-border-subtle rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <HardDrive size={18} className="text-gray-400" />
                  <span className="font-semibold text-text-primary">{q.name || 'Unknown Dataset'}</span>
                </div>
                <div className="text-sm font-mono text-text-muted">
                  <span className="text-text-primary">{usedFormatted}</span> / {totalFormatted}
                </div>
              </div>
              
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-kryonix-blue h-2.5 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${percent}%` }}
                ></div>
              </div>
              <div className="mt-2 text-right text-xs text-text-muted">
                {percent}% Usado
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
