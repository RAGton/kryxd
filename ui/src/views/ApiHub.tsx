import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Code, 
  Play, 
  Send, 
  CheckCircle, 
  Server, 
  Database, 
  Cpu, 
  RefreshCw, 
  Box, 
  Copy, 
  Check, 
  ChevronRight, 
  Sparkles,
  Link2
} from 'lucide-react';
import KveCard from '../components/KveCard';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  rustStruct: string;
  requestPayload?: string;
  responsePayload: string;
}

const INCUS_ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/v1/incus/instances',
    description: 'Retorna a lista completa de instâncias (Containers e VMs) gerenciadas pelo wrapper Incus.',
    rustStruct: `#[derive(Serialize, Deserialize, Debug)]
pub struct IncusInstance {
    pub name: String,
    pub status: String, // "Running", "Stopped", "Error"
    pub instance_type: String, // "container" | "virtual-machine"
    pub ip_address: Option<String>,
    pub cpu_usage_pct: f32,
    pub memory_usage_bytes: u64,
    pub uptime_seconds: u64,
}`,
    responsePayload: `[
  {
    "name": "web-prod-01",
    "status": "Running",
    "instance_type": "virtual-machine",
    "ip_address": "192.168.1.101",
    "cpu_usage_pct": 14.5,
    "memory_usage_bytes": 4294967296,
    "uptime_seconds": 604800
  },
  {
    "name": "db-master-01",
    "status": "Running",
    "instance_type": "virtual-machine",
    "ip_address": "192.168.1.102",
    "cpu_usage_pct": 28.1,
    "memory_usage_bytes": 8589934592,
    "uptime_seconds": 1209600
  },
  {
    "name": "lxc-monitoring",
    "status": "Running",
    "instance_type": "container",
    "ip_address": "192.168.1.103",
    "cpu_usage_pct": 2.4,
    "memory_usage_bytes": 1073741824,
    "uptime_seconds": 2592000
  }
]`
  },
  {
    method: 'POST',
    path: '/api/v1/incus/instances',
    description: 'Cria e inicia uma nova instância Incus baseada em uma imagem cadastrada.',
    rustStruct: `#[derive(Serialize, Deserialize, Debug)]
pub struct CreateInstanceRequest {
    pub name: String,
    pub image: String, // ex: "images:nixos/unstable"
    pub instance_type: String, // "container" | "virtual-machine"
    pub limits_cpu: u32,
    pub limits_memory_bytes: u64,
}`,
    requestPayload: `{
  "name": "api-gateway-test",
  "image": "images:nixos/unstable",
  "instance_type": "container",
  "limits_cpu": 2,
  "limits_memory_bytes": 2147483648
}`,
    responsePayload: `{
  "success": true,
  "message": "Instância 'api-gateway-test' criada com sucesso no nó 'kve-primary'",
  "instance": {
    "name": "api-gateway-test",
    "status": "Stopped",
    "instance_type": "container",
    "ip_address": null,
    "cpu_usage_pct": 0.0,
    "memory_usage_bytes": 0,
    "uptime_seconds": 0
  }
}`
  },
  {
    method: 'PUT',
    path: '/api/v1/incus/instances/:name/state',
    description: 'Muda o estado operacional de uma instância (start, stop, restart).',
    rustStruct: `#[derive(Serialize, Deserialize, Debug)]
pub struct ChangeStateRequest {
    pub action: String, // "start" | "stop" | "restart" | "freeze"
    pub timeout: Option<u32>,
}`,
    requestPayload: `{
  "action": "restart",
  "timeout": 30
}`,
    responsePayload: `{
  "success": true,
  "previous_state": "Running",
  "current_state": "Running",
  "message": "Ação 'restart' enviada com sucesso para a instância 'web-prod-01'"
}`
  }
];

const CEPH_ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/v1/ceph/health',
    description: 'Retorna a integridade do cluster de armazenamento distribuído Ceph (MONs, MGRs, OSDs).',
    rustStruct: `#[derive(Serialize, Deserialize, Debug)]
pub struct CephHealthStatus {
    pub status: String, // "HEALTH_OK", "HEALTH_WARN", "HEALTH_ERR"
    pub overall_summary: String,
    pub osds_total: u32,
    pub osds_up: u32,
    pub osds_in: u32,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub active_monitors: Vec<String>,
}`,
    responsePayload: `{
  "status": "HEALTH_OK",
  "overall_summary": "Ceph distributed cluster is fully operational and synchronized",
  "osds_total": 12,
  "osds_up": 12,
  "osds_in": 12,
  "total_bytes": 52776558133248,
  "used_bytes": 18451874136064,
  "free_bytes": 34324683997184,
  "active_monitors": ["mon-01.kve.internal", "mon-02.kve.internal", "mon-03.kve.internal"]
}`
  },
  {
    method: 'GET',
    path: '/api/v1/ceph/osds',
    description: 'Lista o status detalhado de todos os Object Storage Daemons (OSDs) do cluster.',
    rustStruct: `#[derive(Serialize, Deserialize, Debug)]
pub struct CephOsdDetail {
    pub id: u32,
    pub host: String,
    pub status: String, // "up" | "down"
    pub state: String, // "in" | "out"
    pub weight: f32,
    pub device_path: String,
    pub capacity_bytes: u64,
    pub used_bytes: u64,
}`,
    responsePayload: `[
  {
    "id": 0,
    "host": "kve-storage-01",
    "status": "up",
    "state": "in",
    "weight": 1.0,
    "device_path": "/dev/nvme0n1",
    "capacity_bytes": 4398046511104,
    "used_bytes": 1539316278886
  },
  {
    "id": 1,
    "host": "kve-storage-02",
    "status": "up",
    "state": "in",
    "weight": 1.0,
    "device_path": "/dev/nvme0n1",
    "capacity_bytes": 4398046511104,
    "used_bytes": 1539316278886
  }
]`
  }
];

const FLEET_ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/v1/fleet/nodes',
    description: 'Retorna todos os nós hiperconvergentes que compõem o cluster central KVE.',
    rustStruct: `#[derive(Serialize, Deserialize, Debug)]
pub struct FleetNode {
    pub hostname: String,
    pub ip_address: String,
    pub status: String, // "Online", "Offline"
    pub role: String, // "Controller", "Worker"
    pub cpu_cores: u32,
    pub total_memory_bytes: u64,
    pub load_average_1m: f32,
    pub active_vms: u32,
}`,
    responsePayload: `[
  {
    "hostname": "kve-primary",
    "ip_address": "192.168.1.10",
    "status": "Online",
    "role": "Controller",
    "cpu_cores": 32,
    "total_memory_bytes": 137438953472,
    "load_average_1m": 1.45,
    "active_vms": 3
  },
  {
    "hostname": "kve-backup",
    "ip_address": "192.168.1.20",
    "status": "Online",
    "role": "Worker",
    "cpu_cores": 16,
    "total_memory_bytes": 68719476736,
    "load_average_1m": 0.82,
    "active_vms": 1
  }
]`
  }
];

const ApiHubView: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'incus' | 'ceph' | 'fleet'>('incus');
  const [selectedEndpointIndex, setSelectedEndpointIndex] = useState<number>(0);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  
  // Request simulation states
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResponse, setSimulationResponse] = useState<string | null>(null);
  const [simulatedLatency, setSimulatedLatency] = useState<number | null>(null);

  const getEndpoints = () => {
    switch (activeCategory) {
      case 'incus': return INCUS_ENDPOINTS;
      case 'ceph': return CEPH_ENDPOINTS;
      case 'fleet': return FLEET_ENDPOINTS;
    }
  };

  const endpoints = getEndpoints();
  const currentEndpoint = endpoints[selectedEndpointIndex] || endpoints[0];

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSimulateRequest = () => {
    setIsSimulating(true);
    setSimulationResponse(null);
    setSimulatedLatency(null);

    const start = performance.now();
    setTimeout(() => {
      const end = performance.now();
      setSimulationResponse(currentEndpoint.responsePayload);
      setSimulatedLatency(Math.round(end - start + Math.random() * 50));
      setIsSimulating(false);
    }, 800 + Math.random() * 400);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 pb-20"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Link2 className="text-kve-accent" size={24} />
            Hub de Contratos de API
          </h2>
          <p className="text-slate-500 text-sm">Contratos estritos de payload JSON e assinatura de structs para o Backend Axum (Rust)</p>
        </div>
        <div className="flex bg-slate-950/60 p-1 border border-kve-border rounded-xl">
          <button
            onClick={() => { setActiveCategory('incus'); setSelectedEndpointIndex(0); setSimulationResponse(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeCategory === 'incus' ? 'bg-kve-accent text-kve-bg' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Box size={14} /> Incus Engine
          </button>
          <button
            onClick={() => { setActiveCategory('ceph'); setSelectedEndpointIndex(0); setSimulationResponse(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeCategory === 'ceph' ? 'bg-kve-accent text-kve-bg' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database size={14} /> Ceph Storage
          </button>
          <button
            onClick={() => { setActiveCategory('fleet'); setSelectedEndpointIndex(0); setSimulationResponse(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeCategory === 'fleet' ? 'bg-kve-accent text-kve-bg' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server size={14} /> KVE Fleet
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Endpoints Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <KveCard title="Endpoints" subtitle="Mapeamento de Rotas Axum" icon={<Terminal size={14} />}>
            <div className="space-y-2">
              {endpoints.map((ep, idx) => (
                <button
                  key={idx}
                  onClick={() => { setSelectedEndpointIndex(idx); setSimulationResponse(null); }}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                    selectedEndpointIndex === idx
                      ? 'bg-kve-accent/10 border-kve-accent/50 text-white'
                      : 'bg-slate-900/30 border-kve-border text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                      ep.method === 'GET' ? 'bg-kve-success/20 text-kve-success border border-kve-success/30' :
                      ep.method === 'POST' ? 'bg-kve-accent/20 text-kve-accent border border-kve-accent/30' :
                      'bg-kve-warning/20 text-kve-warning border border-kve-warning/30'
                    }`}>
                      {ep.method}
                    </span>
                    <span className="text-xs font-mono font-semibold select-all text-white truncate flex-1">{ep.path}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal line-clamp-2">{ep.description}</p>
                </button>
              ))}
            </div>
          </KveCard>

          <KveCard title="Axum Rust Handler" subtitle="Exemplo de Handler Axum" icon={<Code size={14} />}>
            <div className="space-y-2">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Nossos microsserviços em Rust usam <code className="text-kve-accent font-mono">axum::Json</code> para processar e retornar estes contratos.
              </p>
              <pre className="text-[9px] font-mono text-slate-300 bg-slate-950/80 p-3 rounded-lg border border-kve-border overflow-x-auto whitespace-pre leading-relaxed select-all">
{`pub async fn handle_request(
    State(state): State<AppState>,
    Json(payload): Json<RequestStruct>
) -> Result<Json<ResponseStruct>, AppError> {
    // Orquestração KVE Rust...
    Ok(Json(response))
}`}
              </pre>
            </div>
          </KveCard>
        </div>

        {/* Contract Details */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Info Card */}
          <KveCard 
            title="Especificação Técnica de Contrato" 
            subtitle="Estrutura de dados e comunicação unificada"
            icon={<Code size={16} />}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-kve-border pb-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black px-2 py-1 rounded border ${
                    currentEndpoint.method === 'GET' ? 'bg-kve-success/20 text-kve-success border-kve-success/40' :
                    currentEndpoint.method === 'POST' ? 'bg-kve-accent/20 text-kve-accent border-kve-accent/40' :
                    'bg-kve-warning/20 text-kve-warning border-kve-warning/40'
                  }`}>
                    {currentEndpoint.method}
                  </span>
                  <span className="text-sm font-mono font-bold text-white">{currentEndpoint.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">Status Esperado:</span>
                  <span className="text-[10px] font-mono text-kve-success bg-kve-success/10 px-2 py-0.5 border border-kve-success/20 rounded font-bold">200 OK</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{currentEndpoint.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Rust Struct Mapping */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rust Struct (Serde)</span>
                    <button 
                      onClick={() => handleCopy(currentEndpoint.rustStruct, 'struct')}
                      className="text-slate-500 hover:text-white transition-colors"
                      title="Copiar Struct Rust"
                    >
                      {copiedText === 'struct' ? <Check size={12} className="text-kve-success" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-kve-border h-64 overflow-y-auto whitespace-pre leading-relaxed select-all">
                    {currentEndpoint.rustStruct}
                  </pre>
                </div>

                {/* Request or Response Payload JSON */}
                <div className="space-y-2">
                  {currentEndpoint.requestPayload ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">JSON Request Payload</span>
                        <button 
                          onClick={() => handleCopy(currentEndpoint.requestPayload || '', 'req')}
                          className="text-slate-500 hover:text-white transition-colors"
                          title="Copiar JSON Request"
                        >
                          {copiedText === 'req' ? <Check size={12} className="text-kve-success" /> : <Copy size={12} />}
                        </button>
                      </div>
                      <pre className="text-[10px] font-mono text-kve-accent bg-slate-950/60 p-4 rounded-xl border border-kve-border h-64 overflow-y-auto whitespace-pre leading-relaxed select-all">
                        {currentEndpoint.requestPayload}
                      </pre>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">JSON Response Schema</span>
                        <button 
                          onClick={() => handleCopy(currentEndpoint.responsePayload, 'res_schema')}
                          className="text-slate-500 hover:text-white transition-colors"
                          title="Copiar JSON Response"
                        >
                          {copiedText === 'res_schema' ? <Check size={12} className="text-kve-success" /> : <Copy size={12} />}
                        </button>
                      </div>
                      <pre className="text-[10px] font-mono text-slate-400 bg-slate-950/60 p-4 rounded-xl border border-kve-border h-64 overflow-y-auto whitespace-pre leading-relaxed select-all">
                        {currentEndpoint.responsePayload}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            </div>
          </KveCard>

          {/* Interactive Axum API Sandbox */}
          <KveCard 
            title="Sandbox de Testes de Endpoints (Axum Mock Engine)" 
            subtitle="Simule chamadas reais de API e analise latências e respostas do servidor Rust"
            icon={<Play size={16} />}
          >
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/40 border border-kve-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-kve-success rounded-full animate-pulse" />
                  <span className="text-xs font-mono text-slate-400">Mock Host:</span>
                  <span className="text-xs font-mono text-white select-all bg-slate-900 px-2 py-0.5 rounded border border-kve-border">127.0.0.1:3000 (Local Rust Server)</span>
                </div>
                <button
                  onClick={handleSimulateRequest}
                  disabled={isSimulating}
                  className="px-5 py-2.5 bg-kve-accent text-kve-bg font-black text-xs rounded-lg hover:bg-kve-accent/90 disabled:opacity-50 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                >
                  {isSimulating ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      ENVIANDO REQUEST...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      DISPARAR REQUISIÇÃO (FETCH)
                    </>
                  )}
                </button>
              </div>

              <AnimatePresence mode="wait">
                {isSimulating && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-8 border border-kve-border rounded-xl bg-slate-950/60 flex flex-col items-center justify-center gap-3 text-center"
                  >
                    <div className="w-10 h-10 rounded-full border-2 border-kve-accent border-t-transparent animate-spin" />
                    <div>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Aguardando Handshake de Cluster...</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-1">Conectando ao wrapper Axum, serializando buffers JSON...</p>
                    </div>
                  </motion.div>
                )}

                {!isSimulating && simulationResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
                        <CheckCircle size={12} className="text-kve-success" />
                        <span>Resposta recebida de:</span>
                        <strong className="text-white">{currentEndpoint.path}</strong>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[10px]">
                        <span>Latência: <strong className="text-kve-accent">{simulatedLatency}ms</strong></span>
                        <span>Tipo: <strong className="text-slate-300">application/json</strong></span>
                      </div>
                    </div>

                    <div className="relative group">
                      <button 
                        onClick={() => handleCopy(simulationResponse, 'sim')}
                        className="absolute right-3 top-3 text-slate-500 hover:text-white transition-colors"
                        title="Copiar Resposta"
                      >
                        {copiedText === 'sim' ? <Check size={12} className="text-kve-success" /> : <Copy size={12} />}
                      </button>
                      <pre className="text-[10px] font-mono text-kve-success bg-black p-4 rounded-xl border border-kve-border h-64 overflow-y-auto whitespace-pre leading-relaxed select-all">
                        {simulationResponse}
                      </pre>
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

export default ApiHubView;
