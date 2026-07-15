import { useState } from 'react';
import { X, Server, Layout, Cpu, CheckCircle } from 'lucide-react';
import { createVirtInstance } from '../lib/api.js';

export default function VirtWizard({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [config, setConfig] = useState({
    name: '',
    is_vm: false,
    image: 'images:ubuntu/24.04',
    cpu: 2,
    ram_mb: 2048,
    disk_gb: 20
  });

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      await createVirtInstance(config);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Error creating instance');
      setLoading(false);
    }
  };

  const steps = [
    { id: 1, title: 'General', icon: <Server size={18} /> },
    { id: 2, title: 'OS', icon: <Layout size={18} /> },
    { id: 3, title: 'Specs', icon: <Cpu size={18} /> },
    { id: 4, title: 'Confirm', icon: <CheckCircle size={18} /> }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-elevated border border-border-subtle shadow-panel rounded-xl w-[700px] flex overflow-hidden">
        
        {/* Sidebar Steps */}
        <div className="w-48 bg-kryonix-dark border-r border-gray-800 p-6 flex flex-col gap-6 text-white">
          <h3 className="font-semibold text-lg border-b border-gray-800 pb-2">Nova Instância</h3>
          <div className="flex flex-col gap-4">
            {steps.map(s => (
              <div key={s.id} className={`flex items-center gap-3 transition-colors ${step === s.id ? 'text-kryonix-blue font-medium' : 'text-gray-500'}`}>
                {s.icon}
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col h-[450px]">
          <div className="flex justify-between items-center p-6 border-b border-border-subtle">
            <h2 className="text-xl font-medium">{steps.find(s => s.id === step)?.title}</h2>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
          </div>

          <div className="flex-1 p-8 overflow-y-auto">
            {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 text-red-400 rounded-lg">{error}</div>}
            
            {step === 1 && (
              <div className="flex flex-col gap-5 animate-fade-in-up">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Hostname</label>
                  <input 
                    type="text" 
                    value={config.name} 
                    onChange={e => setConfig({...config, name: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-kryonix-blue"
                    placeholder="ex: web-server-01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Type</label>
                  <div className="flex gap-4">
                    <label className={`flex-1 flex items-center justify-center p-4 rounded-lg border cursor-pointer transition-colors ${!config.is_vm ? 'border-kryonix-blue bg-kryonix-blue/10 text-kryonix-blue' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'}`}>
                      <input type="radio" name="type" className="hidden" checked={!config.is_vm} onChange={() => setConfig({...config, is_vm: false})} />
                      LXC Container
                    </label>
                    <label className={`flex-1 flex items-center justify-center p-4 rounded-lg border cursor-pointer transition-colors ${config.is_vm ? 'border-kryonix-blue bg-kryonix-blue/10 text-kryonix-blue' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'}`}>
                      <input type="radio" name="type" className="hidden" checked={config.is_vm} onChange={() => setConfig({...config, is_vm: true})} />
                      Virtual Machine
                    </label>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5 animate-fade-in-up">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">OS Image (Incus Format)</label>
                  <input 
                    type="text" 
                    value={config.image} 
                    onChange={e => setConfig({...config, image: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-kryonix-blue"
                    placeholder="images:ubuntu/24.04"
                  />
                  <p className="text-xs text-gray-500 mt-2">Examples: images:debian/12, images:alpine/3.19</p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5 animate-fade-in-up">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">CPU Cores</label>
                  <input 
                    type="number" 
                    value={config.cpu} 
                    onChange={e => setConfig({...config, cpu: parseInt(e.target.value) || 1})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-kryonix-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Memory (MB)</label>
                  <input 
                    type="number" 
                    value={config.ram_mb} 
                    onChange={e => setConfig({...config, ram_mb: parseInt(e.target.value) || 512})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-kryonix-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Disk (GB)</label>
                  <input 
                    type="number" 
                    value={config.disk_gb} 
                    onChange={e => setConfig({...config, disk_gb: parseInt(e.target.value) || 10})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-kryonix-blue"
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-4 animate-fade-in-up text-sm">
                <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="grid grid-cols-2 gap-y-3">
                    <div className="text-gray-400">Name</div>
                    <div className="font-semibold text-white">{config.name || '(vazio)'}</div>
                    
                    <div className="text-gray-400">Type</div>
                    <div className="text-white">{config.is_vm ? 'Virtual Machine' : 'LXC Container'}</div>
                    
                    <div className="text-gray-400">Image</div>
                    <div className="text-white">{config.image}</div>
                    
                    <div className="text-gray-400">CPU</div>
                    <div className="text-white">{config.cpu} cores</div>
                    
                    <div className="text-gray-400">Memory</div>
                    <div className="text-white">{config.ram_mb} MB</div>
                    
                    <div className="text-gray-400">Disk</div>
                    <div className="text-white">{config.disk_gb} GB</div>
                  </div>
                </div>
                <p className="text-gray-500 mt-2">Clique em Criar para disparar o motor do Incus via KCP.</p>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-border-subtle bg-bg-surface flex justify-between">
            {step > 1 ? (
              <button 
                onClick={() => setStep(s => s - 1)} 
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                disabled={loading}
              >
                Back
              </button>
            ) : <div></div>}

            {step < 4 ? (
              <button 
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 && !config.name}
                className="px-4 py-2 rounded-lg bg-kryonix-blue text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button 
                onClick={handleCreate}
                disabled={loading}
                className="px-6 py-2 rounded-lg bg-kryonix-blue text-white hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : null}
                Criar
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
