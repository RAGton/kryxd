import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Monitor, 
  Cpu, 
  Database, 
  RefreshCw, 
  Layers, 
  ShieldCheck, 
  Power, 
  Wifi, 
  Terminal, 
  Network, 
  User, 
  LogOut, 
  MessageSquare, 
  Send, 
  CheckCircle, 
  Activity, 
  Play, 
  Plus, 
  Trash,
  Settings,
  AlertCircle
} from 'lucide-react';
import KveCard from '../components/KveCard';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface PXEImage {
  id: string;
  name: string;
  kernel: string;
  args: string;
  sizeMb: number;
  status: 'Active' | 'Idle' | 'Compiling';
  lastUpdated: string;
}

interface NetbootDevice {
  mac: string;
  ip: string;
  hostname: string;
  assignedImageId: string;
  status: 'Online' | 'Booting' | 'Offline';
  ramGb: number;
  cpuCores: number;
}

interface ActiveSession {
  id: string;
  username: string;
  deviceIp: string;
  terminalServer: string;
  idleTime: string;
  cpuPct: number;
  memPct: number;
  status: 'Active' | 'Idle';
}

const mockPXEImages: PXEImage[] = [
  { id: 'img-01', name: 'NixOS-Thin-Client-v2.6', kernel: '6.6.21-kve-lts', args: 'initrd=initrd ip=dhcp console=ttyS0 boot.shell_on_fail', sizeMb: 420, status: 'Active', lastUpdated: 'Hoje, 10:15' },
  { id: 'img-02', name: 'KVE-Rescue-Shell-v1.4', kernel: '6.1.72-rescue', args: 'initrd=initrd_rescue ip=dhcp rescue_mode=true nomodeset', sizeMb: 180, status: 'Active', lastUpdated: 'Ontem, 18:30' },
  { id: 'img-03', name: 'Alpine-Diskless-KVE-v3.19', kernel: '6.6.8-alpine', args: 'initrd=initramfs-alpine ip=dhcp alpine_dev=nfs', sizeMb: 95, status: 'Idle', lastUpdated: '12 Jul 2026' },
];

const mockDevices: NetbootDevice[] = [
  { mac: '00:1A:2B:3C:4D:5E', ip: '192.168.1.150', hostname: 'thin-client-01', assignedImageId: 'img-01', status: 'Online', ramGb: 4, cpuCores: 2 },
  { mac: '00:1A:2B:3C:4D:5F', ip: '192.168.1.151', hostname: 'thin-client-02', assignedImageId: 'img-01', status: 'Online', ramGb: 4, cpuCores: 2 },
  { mac: '00:1A:2B:3C:4D:60', ip: '192.168.1.152', hostname: 'lab-pc-01', assignedImageId: 'img-01', status: 'Booting', ramGb: 8, cpuCores: 4 },
  { mac: '00:1A:2B:3C:4D:61', ip: '192.168.1.153', hostname: 'lab-pc-02', assignedImageId: 'img-02', status: 'Offline', ramGb: 8, cpuCores: 4 },
  { mac: '00:1A:2B:3C:4D:62', ip: '192.168.1.154', hostname: 'gate-term-03', assignedImageId: 'img-01', status: 'Online', ramGb: 4, cpuCores: 2 },
];

const mockSessions: ActiveSession[] = [
  { id: 'sess-01', username: 'operator-01', deviceIp: '192.168.1.150', terminalServer: 'kve-primary', idleTime: '2m 14s', cpuPct: 12, memPct: 45, status: 'Active' },
  { id: 'sess-02', username: 'user-alpha', deviceIp: '192.168.1.151', terminalServer: 'kve-primary', idleTime: '15m 03s', cpuPct: 1, memPct: 22, status: 'Idle' },
  { id: 'sess-03', username: 'aguiarrocha', deviceIp: '192.168.1.154', terminalServer: 'kve-primary', idleTime: 'Agora', cpuPct: 45, memPct: 68, status: 'Active' },
];

const networkTrafficData = Array.from({ length: 15 }, (_, i) => ({
  time: `${i * 2}m ago`,
  rx: Math.random() * 40 + 10,
  tx: Math.random() * 80 + 15,
}));

const ThinkServerView: React.FC = () => {
  const [pxeImages, setPxeImages] = useState<PXEImage[]>(mockPXEImages);
  const [devices, setDevices] = useState<NetbootDevice[]>(mockDevices);
  const [sessions, setSessions] = useState<ActiveSession[]>(mockSessions);
  
  // Modal / forms state
  const [showAddImage, setShowAddImage] = useState(false);
  const [newImageName, setNewImageName] = useState('');
  const [newImageKernel, setNewImageKernel] = useState('6.6.21-kve-lts');
  const [newImageArgs, setNewImageArgs] = useState('initrd=initrd ip=dhcp');
  
  // Message target state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const handleCreatePXEImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImageName) return;

    const newImg: PXEImage = {
      id: `img-${Date.now()}`,
      name: newImageName,
      kernel: newImageKernel,
      args: newImageArgs,
      sizeMb: Math.floor(100 + Math.random() * 400),
      status: 'Compiling',
      lastUpdated: 'Compilando...'
    };

    setPxeImages([newImg, ...pxeImages]);
    setShowAddImage(false);
    setNewImageName('');

    // Simulate completion
    setTimeout(() => {
      setPxeImages(prev => prev.map(img => img.id === newImg.id ? { ...img, status: 'Active', lastUpdated: 'Agora' } : img));
    }, 5000);
  };

  const handleDeviceImageChange = (mac: string, imgId: string) => {
    setDevices(devices.map(dev => dev.mac === mac ? { ...dev, assignedImageId: imgId } : dev));
  };

  const handleKillSession = (id: string) => {
    setSessions(sessions.filter(sess => sess.id !== id));
  };

  const handleWakeOnLan = (mac: string) => {
    setDevices(devices.map(dev => dev.mac === mac && dev.status === 'Offline' ? { ...dev, status: 'Booting' } : dev));
    
    // Simulate booting up
    setTimeout(() => {
      setDevices(prev => prev.map(dev => dev.mac === mac && dev.status === 'Booting' ? { ...dev, status: 'Online' } : dev));
    }, 7000);
  };

  const handleSendMessage = () => {
    if (!broadcastMessage) return;
    setIsSendingMessage(true);
    setTimeout(() => {
      setIsSendingMessage(false);
      setBroadcastMessage('');
      setSelectedSessionId(null);
      alert('Mensagem enviada com sucesso ao terminal magro!');
    }, 1000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 pb-20"
    >
      {/* Header and status indicators */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Monitor className="text-kve-accent" size={24} />
            Node Server Panel
          </h2>
          <p className="text-slate-500 text-sm">Gerenciamento Centralizado de Terminais Diskless, Imagens PXE e Terminais Magros</p>
        </div>
        
        <div className="flex items-center gap-4 bg-slate-950/40 px-4 py-2 rounded-xl border border-kve-border text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-kve-success animate-pulse" />
            <span className="text-slate-400">Servidor TFTP/NFS: <strong className="text-white">ATIVO</strong></span>
          </div>
          <div className="w-px h-4 bg-kve-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Boot Total: <strong className="text-kve-accent">{devices.filter(d => d.status === 'Online').length} Ativos</strong></span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Monitor size={12} /> Active Thin Clients
            </h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-kve-success">{devices.filter(d => d.status === 'Online').length}</span>
            <span className="text-[10px] text-kve-success uppercase font-bold">Online</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1 mt-3 overflow-hidden">
            <div className="bg-kve-success h-full" style={{ width: `${(devices.filter(d => d.status === 'Online').length / devices.length) * 100}%` }} />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={12} /> NFS/TFTP Throughput
            </h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">1.2</span>
            <span className="text-[10px] text-slate-400 uppercase font-bold">GB/s</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2.5">Pico de rede local</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Layers size={12} /> PXE Images
            </h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{pxeImages.filter(i => i.status === 'Active').length}</span>
            <span className="text-[10px] text-slate-400 uppercase font-bold">Declarativas</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2.5">Sincronizadas via NixOS</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Power size={12} /> Wake-on-LAN Ready
            </h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">150</span>
            <span className="text-[10px] text-slate-400 uppercase font-bold">MACs</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2.5">Configurados no DHCP</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* PXE Image Management */}
        <div className="xl:col-span-5 space-y-6">
          <KveCard 
            title="Repositório de Imagens PXE / Netboot" 
            subtitle="Perfis de boot declarativos compilados em NixOS"
            icon={<Layers size={16} />}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Perfís Disponíveis</p>
                <button
                  onClick={() => setShowAddImage(true)}
                  className="px-3 py-1.5 bg-kve-accent/10 border border-kve-accent/30 text-kve-accent hover:bg-kve-accent/20 transition-all text-[10px] font-bold rounded-lg flex items-center gap-1.5"
                >
                  <Plus size={12} /> CRIAR IMAGEM NIX
                </button>
              </div>

              {/* Add Image Form */}
              <AnimatePresence>
                {showAddImage && (
                  <motion.form 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleCreatePXEImage}
                    className="p-4 bg-slate-950/60 border border-kve-border rounded-xl space-y-3 overflow-hidden"
                  >
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome do Perfil PXE</label>
                      <input 
                        type="text" 
                        placeholder="Ex: NixOS-Kiosk-2026" 
                        className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-kve-accent/50"
                        value={newImageName}
                        onChange={(e) => setNewImageName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Kernel</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-kve-accent/50"
                        value={newImageKernel}
                        onChange={(e) => setNewImageKernel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Argumentos do Kernel (Boot params)</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-kve-accent/50"
                        value={newImageArgs}
                        onChange={(e) => setNewImageArgs(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button 
                        type="button" 
                        onClick={() => setShowAddImage(false)}
                        className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
                      >
                        CANCELAR
                      </button>
                      <button 
                        type="submit" 
                        className="px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded"
                      >
                        COMPILAR IMAGEM (NIX-BUILD)
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Images List */}
              <div className="space-y-3">
                {pxeImages.map(img => (
                  <div key={img.id} className="p-3 bg-slate-950/40 border border-kve-border rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="text-kve-accent" size={14} />
                        <span className="text-xs font-bold text-white">{img.name}</span>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        img.status === 'Active' ? 'bg-kve-success/20 text-kve-success border border-kve-success/30' :
                        img.status === 'Compiling' ? 'bg-kve-accent/20 text-kve-accent border border-kve-accent/30 animate-pulse' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {img.status === 'Active' ? 'ATIVO' : img.status === 'Compiling' ? 'COMPILANDO...' : 'INATIVO'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 border-t border-b border-kve-border/20 py-1.5">
                      <div>Kernel: <span className="font-mono text-slate-300">{img.kernel}</span></div>
                      <div>Tamanho: <span className="font-mono text-slate-300">{img.sizeMb} MB</span></div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[9px] text-slate-600 uppercase font-bold">Args de Kernel:</div>
                      <div className="text-[9px] font-mono text-slate-400 truncate bg-black/40 p-1.5 rounded border border-kve-border/30 select-all">{img.args}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </KveCard>

          {/* Traffic Monitor Chart */}
          <KveCard title="Tráfego do Servidor de Boot (NFS / TFTP)" subtitle="Uso de largura de banda em tempo real" icon={<Activity size={14} />}>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={networkTrafficData}>
                  <defs>
                    <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip contentStyle={{ backgroundColor: '#070a13', border: '1px solid #1e293b', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="rx" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRx)" name="Leitura (NFS Read)" />
                  <Area type="monotone" dataKey="tx" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorTx)" name="Escrita (NFS Write)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </KveCard>
        </div>

        {/* Netboot Fleets & Active Sessions */}
        <div className="xl:col-span-7 space-y-6">
          
          {/* Netboot Fleet Table */}
          <KveCard 
            title="Frota de Terminais Diskless (Netboot Fleet)" 
            subtitle="Mapeamento físico de máquinas ligadas sem disco via rede"
            icon={<Monitor size={16} />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-400">
                <thead className="text-[10px] uppercase text-slate-500 tracking-wider border-b border-kve-border bg-slate-950/20">
                  <tr>
                    <th className="py-3 px-4">Hostname / MAC</th>
                    <th className="py-3 px-4">Endereço IP</th>
                    <th className="py-3 px-4">Perfil PXE</th>
                    <th className="py-3 px-4">Hardware</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-kve-border/40">
                  {devices.map(dev => (
                    <tr key={dev.mac} className="hover:bg-slate-900/20 transition-all">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <Monitor size={12} className="text-slate-500" />
                          {dev.hostname}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">{dev.mac}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{dev.ip}</td>
                      <td className="py-3 px-4">
                        <select
                          value={dev.assignedImageId}
                          onChange={(e) => handleDeviceImageChange(dev.mac, e.target.value)}
                          className="bg-slate-950/80 border border-kve-border/60 rounded px-2 py-1 text-[10px] font-medium text-kve-accent focus:outline-none"
                        >
                          {pxeImages.map(img => (
                            <option key={img.id} value={img.id}>{img.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4 text-[10px] text-slate-500">
                        {dev.cpuCores} vCPU / {dev.ramGb} GB RAM
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          dev.status === 'Online' ? 'bg-kve-success/10 text-kve-success border border-kve-success/20' :
                          dev.status === 'Booting' ? 'bg-kve-warning/10 text-kve-warning border border-kve-warning/20 animate-pulse' :
                          'bg-slate-950 text-slate-600 border border-slate-900'
                        }`}>
                          {dev.status === 'Online' ? 'CONECTADO' : dev.status === 'Booting' ? 'LIGANDO...' : 'OFFLINE'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {dev.status === 'Offline' ? (
                          <button
                            onClick={() => handleWakeOnLan(dev.mac)}
                            className="p-1 px-2.5 rounded bg-kve-accent/10 border border-kve-accent/30 text-kve-accent hover:bg-kve-accent text-[9px] hover:text-kve-bg font-bold transition-all flex items-center gap-1 ml-auto"
                          >
                            <Power size={10} /> WOL
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600 font-mono italic">Sem ação</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </KveCard>

          {/* Active Terminal Users & Shell Messages */}
          <KveCard 
            title="Terminais Ativos" 
            subtitle="Sessões de terminal magro em andamento"
            icon={<User size={16} />}
          >
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-400">
                  <thead className="text-[10px] uppercase text-slate-500 tracking-wider border-b border-kve-border bg-slate-950/20">
                    <tr>
                      <th className="py-3 px-4">Hostname</th>
                      <th className="py-3 px-4">IP</th>
                      <th className="py-3 px-4">User Logado</th>
                      <th className="py-3 px-4">Tempo de Sessão</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-kve-border/40">
                    {sessions.map(sess => (
                      <tr key={sess.id} className="hover:bg-slate-900/20 transition-all">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <Monitor size={12} className="text-kve-accent" />
                            {devices.find(d => d.ip === sess.deviceIp)?.hostname || 'unknown-host'}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-widest">{sess.status}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">{sess.deviceIp}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-300 flex items-center gap-1.5">
                            <User size={12} className="text-slate-500" />
                            {sess.username}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">{sess.idleTime} (Idle)</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleKillSession(sess.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-900/40 border border-red-800 text-red-200 hover:bg-red-800 hover:text-white transition-all text-[10px] font-bold inline-flex items-center gap-1.5"
                            title="Drop Session"
                          >
                            <LogOut size={12} /> Drop Session
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Message Composer Area */}
              <AnimatePresence>
                {selectedSessionId && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 bg-slate-950/60 border border-kve-border rounded-xl space-y-3"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <MessageSquare size={14} className="text-kve-accent" />
                        Mensagem de Console para o Operador: <strong className="text-kve-accent">
                          {sessions.find(s => s.id === selectedSessionId)?.username || 'Todos'}
                        </strong>
                      </span>
                      <button 
                        onClick={() => setSelectedSessionId(null)}
                        className="text-slate-500 hover:text-white transition-colors"
                      >
                        FECHAR
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        value={broadcastMessage}
                        onChange={(e) => setBroadcastMessage(e.target.value)}
                        placeholder="Insira uma mensagem que aparecerá como um pop-up no terminal magro do operador..."
                        className="w-full h-16 bg-slate-900 border border-kve-border rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-kve-accent/50 selection:bg-kve-accent/20"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleSendMessage}
                        disabled={isSendingMessage || !broadcastMessage}
                        className="px-4 py-2 bg-kve-accent text-kve-bg font-bold text-xs rounded-lg hover:bg-kve-accent/90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-[0_0_25px_rgba(56,189,248,0.2)]"
                      >
                        {isSendingMessage ? 'ENVIANDO...' : 'TRANSMITIR MENSAGEM'}
                        <Send size={12} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </KveCard>
        </div>

      </div>
    </motion.div>
  );
};

export default ThinkServerView;
