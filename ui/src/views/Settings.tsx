import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Settings, Shield, Network, Database, Bell, User, Globe, Lock, Save, RefreshCw, AlertTriangle, Terminal, Cpu, HardDrive, Layers, CheckCircle, Zap } from 'lucide-react';
import KveCard from '../components/KveCard';

const NIXOS_TEMPLATES: Record<string, string> = {
  standard: `# Configuração Declarativa do Cluster KVE
# Perfil: Standard Hypervisor Node

{ config, pkgs, ... }:

{
  imports = [ ./hardware-configuration.nix ];

  # Virtualização & suporte a hipervisores
  virtualisation.libvirtd = {
    enable = true;
    qemu = {
      package = pkgs.qemu_kvm;
      runAsRoot = true;
    };
  };

  # Rede de ponte para as VMs do cluster
  networking.bridges.vmbr0.interfaces = [ "enp0s3" ];
  networking.interfaces.vmbr0.ipv4.addresses = [{
    address = "192.168.1.10";
    prefixLength = 24;
  }];

  # Pontos de montagem NFS para volumes compartilhados
  fileSystems."/export/nix-store" = {
    device = "/dev/nvme0n1p2";
    fsType = "btrfs";
    options = [ "compress=zstd" "subvol=nix-store" ];
  };

  services.nfs.server = {
    enable = true;
    exports = ''
      /export/home       192.168.1.0/24(rw,sync,no_root_squash)
      /export/nix-store  192.168.1.0/24(ro,async,no_root_squash)
    '';
  };
}`,
  storage: `# Configuração Declarativa do Cluster KVE
# Perfil: High Availability Storage Server

{ config, pkgs, ... }:

{
  imports = [ ./hardware-configuration.nix ];

  # Ativar sistemas de arquivo de storage corporativo
  boot.supportedFilesystems = [ "zfs" "btrfs" "nfs" ];

  # Tuning de pools ZFS para o cluster KVE
  boot.zfs.devNodes = "/dev/disk/by-id";
  boot.zfs.forceImportAll = true;

  networking.interfaces.vmbr0.ipv4.addresses = [{
    address = "192.168.1.20";
    prefixLength = 24;
  }];

  # Compartilhamentos NFS integrados ao Storage Pool
  services.nfs.server = {
    enable = true;
    exports = ''
      /export/backup-zfs  192.168.1.0/24(rw,async,no_root_squash,no_subtree_check)
      /export/vms-shared   192.168.1.0/24(rw,sync,no_root_squash,no_subtree_check)
    '';
  };
}`,
  gpu: `# Configuração Declarativa do Cluster KVE
# Perfil: GPU-Passthrough Hypervisor (PCIe Passthrough)

{ config, pkgs, ... }:

{
  imports = [ ./hardware-configuration.nix ];

  # Parâmetros de kernel para isolamento de barramento PCIe IOMMU
  boot.kernelParams = [ "amd_iommu=on" "intel_iommu=on" "iommu=pt" "kvm.ignore_msrs=1" ];
  boot.kernelModules = [ "vfio" "vfio_iommu_type1" "vfio_pci" "vfio_virqfd" ];

  # Blacklistar drivers host da GPU para uso livre nas VMs
  boot.blacklistedKernelModules = [ "nvidia" "nouveau" "nvidia_drm" "nvidia_modeset" ];

  virtualisation.libvirtd = {
    enable = true;
    qemu = {
      package = pkgs.qemu_kvm;
      runAsRoot = true;
      ovmf.enable = true;
    };
  };
}`,
  container: `# Configuração Declarativa do Cluster KVE
# Perfil: Micro-OS Lightweight Container Host

{ config, pkgs, ... }:

{
  imports = [ ./hardware-configuration.nix ];

  # Mecanismo Docker otimizado com subvolumes BTRFS
  virtualisation.docker = {
    enable = true;
    storageDriver = "btrfs";
    autoPrune.enable = true;
  };

  # Podman integrado como alternativa rootless
  virtualisation.podman = {
    enable = true;
    dockerCompat = true;
  };

  # Otimizações de rede do Kernel para alta densidade
  boot.kernel.sysctl = {
    "fs.file-max" = 2097152;
    "net.core.somaxconn" = 4096;
  };
}`
};

const MODULAR_SERVICES = [
  { key: 'tailscale', label: 'Tailscale VPN Mesh', line: 'services.tailscale.enable = true;', description: 'Cria uma VPN overlay segura de zero-configuração' },
  { key: 'prometheus', label: 'Prometheus Node Exporter', line: 'services.prometheus.exporters.node.enable = true;', description: 'Coleta métricas detalhadas de hardware e rede para o KVE' },
  { key: 'docker', label: 'Docker Daemon Engine', line: 'virtualisation.docker.enable = true;', description: 'Habilita Docker para containers leves integrados à bridge' },
  { key: 'fail2ban', label: 'Fail2ban IPS Protection', line: 'services.fail2ban.enable = true;', description: 'Prevenção contra força bruta banindo IPs suspeitos no SSH' },
  { key: 'autoOptimise', label: 'Nix Auto Store Optimise', line: 'nix.settings.auto-optimise-store = true;', description: 'Une arquivos idênticos no nix-store otimizando espaço em disco' }
];

const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [nixosCode, setNixosCode] = useState('');
  const [generation, setGeneration] = useState(142);
  const [kernel, setKernel] = useState("6.6.14-rt-pve");
  const [lastRebuild, setLastRebuild] = useState("May 28, 2026 14:15:22");
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildLogs, setBuildLogs] = useState('');
  const [activeTemplate, setActiveTemplate] = useState('standard');

  const tabs = [
    { id: 'general', label: 'Geral', icon: Settings },
    { id: 'nixos', label: 'NixOS (Declarativo)', icon: Terminal },
    { id: 'network', label: 'Rede / Gateway', icon: Network },
    { id: 'storage', label: 'Storage / NFS', icon: Database },
    { id: 'security', label: 'Segurança', icon: Shield },
  ];

  // Fetch initial NixOS config from backend
  useEffect(() => {
    const fetchNixos = async () => {
      try {
        const res = await fetch('/api/nixos/config');
        if (res.ok) {
          const data = await res.json();
          setNixosCode(data.config);
          setGeneration(data.generation);
          setKernel(data.activeKernel);
          setLastRebuild(data.lastRebuildTime);
        }
      } catch (e) {
        console.error("Failed to load NixOS configuration", e);
      }
    };
    fetchNixos();
  }, []);

  const handleNixosRebuild = async () => {
    setIsBuilding(true);
    setBuildLogs("Iniciando nixos-rebuild switch --target-host pve-01-nixos...\n");
    
    // Simulate compilation logs scrolling
    const logs = [
      "Processando avaliação de módulos nix...",
      "Processando canais de pacotes (nixpkgs channels)...",
      "Calculando derivações do fecho da árvore de pacotes...",
      "Compilando kernel modules pve-rt-kernel...",
      "Montando fechos de dependência e links do sistema...",
      "Copiando arquivos do nix-store de build (/nix/store/7xp91f...)...",
      "Criando geração de perfil /nix/var/nix/profiles/system-143-link...",
      "Sincronizando serviços systemd (libvirtd.service, qemu-guest.service)...",
      "Rebuilding GRUB/Systemd-boot loaders...",
      "Sucesso! Sistema alternado para a geração 143."
    ];

    let currentLog = "Iniciando nixos-rebuild switch --target-host pve-01-nixos...\n";
    for (let i = 0; i < logs.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 600));
      currentLog += `${logs[i]}\n`;
      setBuildLogs(currentLog);
    }

    try {
      const res = await fetch('/api/nixos/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: nixosCode })
      });
      if (res.ok) {
        const data = await res.json();
        setGeneration(data.generation);
        setLastRebuild(new Date().toLocaleString());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleSelectTemplate = (key: string) => {
    setActiveTemplate(key);
    setNixosCode(NIXOS_TEMPLATES[key]);
  };

  const handleToggleService = (line: string, active: boolean) => {
    let updatedCode = nixosCode;
    const formattedLine = `  ${line.trim()}\n`;
    
    if (active) {
      if (!nixosCode.includes(line.trim())) {
        const lastBracketIdx = nixosCode.lastIndexOf('}');
        if (lastBracketIdx !== -1) {
          updatedCode = nixosCode.slice(0, lastBracketIdx) + formattedLine + nixosCode.slice(lastBracketIdx);
        } else {
          updatedCode = nixosCode + `\n${formattedLine}`;
        }
      }
    } else {
      const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\s*${escapeRegExp(line.trim())}\\s*\\n?`, 'g');
      updatedCode = nixosCode.replace(regex, '\n');
    }
    
    setNixosCode(updatedCode);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Configurações do Sistema</h2>
          <p className="text-slate-500 text-sm">Ajustes globais de infraestrutura, segurança e preferências corporativas</p>
        </div>
        <button className="px-6 py-2.5 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_25px_rgba(56,189,248,0.4)] transition-all flex items-center gap-2">
          <Save size={18} /> SALVAR ALTERAÇÕES
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Tabs Sidebar */}
        <div className="w-full lg:w-64 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeTab === tab.id 
                  ? "bg-kve-accent/10 text-kve-accent border border-kve-accent/20" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <tab.icon size={20} />
              <span className="text-sm font-bold uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 space-y-6">
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <KveCard title="Informações do Sistema" icon={<Globe size={16} />}>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hostname do Servidor</label>
                    <input type="text" defaultValue="kve-control-01" className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Domínio Local</label>
                    <input type="text" defaultValue="kve.internal" className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fuso Horário</label>
                    <select className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors appearance-none">
                      <option>America/Sao_Paulo (GMT-3)</option>
                      <option>UTC</option>
                      <option>America/New_York (GMT-5)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Idioma da Interface</label>
                    <select className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors appearance-none">
                      <option>Português (Brasil)</option>
                      <option>English (US)</option>
                    </select>
                  </div>
                </div>
              </KveCard>

              <KveCard title="Manutenção e Atualizações" icon={<RefreshCw size={16} />}>
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/40 border border-kve-border">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-kve-accent/10 rounded-xl text-kve-accent">
                      <Terminal size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Versão do Sistema: v1.2.4-stable</p>
                      <p className="text-xs text-slate-500">Última verificação: {lastRebuild}</p>
                    </div>
                  </div>
                  <button className="px-4 py-2 rounded-lg border border-kve-accent/30 text-kve-accent font-bold text-xs hover:bg-kve-accent/10 transition-all">
                    VERIFICAR ATUALIZAÇÕES
                  </button>
                </div>
              </KveCard>
            </div>
          )}

          {activeTab === 'nixos' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* Column 1: Templates & Services Toggles */}
                <div className="xl:col-span-4 space-y-6">
                  
                  {/* Preset Templates */}
                  <KveCard title="Perfis NixOS" subtitle="Carregar templates de cluster" icon={<Layers size={14} />}>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleSelectTemplate('standard')}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          activeTemplate === 'standard'
                            ? 'bg-kve-accent/10 border-kve-accent/50 text-white'
                            : 'bg-slate-900/30 border-kve-border text-slate-400 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">Standard Hypervisor</span>
                          {activeTemplate === 'standard' && <CheckCircle size={12} className="text-kve-accent" />}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Libvirtd + QEMU ideal para computação geral</p>
                      </button>

                      <button
                        onClick={() => handleSelectTemplate('storage')}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          activeTemplate === 'storage'
                            ? 'bg-kve-accent/10 border-kve-accent/50 text-white'
                            : 'bg-slate-900/30 border-kve-border text-slate-400 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">HA Storage Profile</span>
                          {activeTemplate === 'storage' && <CheckCircle size={12} className="text-kve-accent" />}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">ZFS Pools integrados com NFS compartilhado</p>
                      </button>

                      <button
                        onClick={() => handleSelectTemplate('gpu')}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          activeTemplate === 'gpu'
                            ? 'bg-kve-accent/10 border-kve-accent/50 text-white'
                            : 'bg-slate-900/30 border-kve-border text-slate-400 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">GPU-Passthrough</span>
                          {activeTemplate === 'gpu' && <CheckCircle size={12} className="text-kve-accent" />}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Isolamento IOMMU p/ virtualizar placas gráficas</p>
                      </button>

                      <button
                        onClick={() => handleSelectTemplate('container')}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          activeTemplate === 'container'
                            ? 'bg-kve-accent/10 border-kve-accent/50 text-white'
                            : 'bg-slate-900/30 border-kve-border text-slate-400 hover:border-slate-700 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">OS Container Host</span>
                          {activeTemplate === 'container' && <CheckCircle size={12} className="text-kve-accent" />}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Docker e Podman otimizados p/ alta densidade</p>
                      </button>
                    </div>
                  </KveCard>

                  {/* Interactive Service Toggles */}
                  <KveCard title="Módulos & Serviços" subtitle="Instalação por chave física" icon={<Zap size={14} />}>
                    <div className="space-y-4">
                      <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-wider">Toggles interativos. Ao ativar, injeta a declaração diretamente no editor NixOS ao lado.</p>
                      
                      <div className="space-y-3">
                        {MODULAR_SERVICES.map(srv => {
                          const active = nixosCode.includes(srv.line.trim());
                          return (
                            <div key={srv.key} className="p-3 bg-slate-950/40 rounded-xl border border-kve-border flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white">{srv.label}</span>
                                <button
                                  onClick={() => handleToggleService(srv.line, !active)}
                                  className={`w-10 h-5 rounded-full relative transition-colors ${
                                    active ? 'bg-kve-accent' : 'bg-slate-800'
                                  }`}
                                >
                                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                                    active ? 'right-0.5' : 'left-0.5'
                                  }`} />
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-400 leading-tight">{srv.description}</p>
                              {active && (
                                <span className="text-[9px] font-mono text-kve-accent bg-kve-accent/10 px-1.5 py-0.5 rounded border border-kve-accent/20 w-max uppercase tracking-wider">
                                  Configurado no Nix
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </KveCard>
                </div>

                {/* Column 2: Code Editor & Rebuild Progress */}
                <div className="xl:col-span-8 space-y-6">
                  <KveCard 
                    title="Configuração Declarativa do Cluster (NixOS)" 
                    subtitle={`Geração Ativa: #${generation} | Kernel: ${kernel}`}
                    icon={<Terminal size={16} />}
                  >
                    <div className="space-y-4">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        A infraestrutura unificada do Cluster é declarada via módulos do NixOS. Você pode editar os parâmetros de virtualization (<strong className="text-white">libvirtd</strong>), bridges de canais e compartilhamentos NFS centralizados abaixo e aplicar neles:
                      </p>
                      
                      <textarea
                        value={nixosCode}
                        onChange={(e) => setNixosCode(e.target.value)}
                        className="w-full h-[420px] bg-black/60 border border-kve-border rounded-xl p-4 text-xs font-mono text-kve-accent focus:outline-none focus:border-kve-accent/50 selection:bg-kve-accent/20 leading-relaxed whitespace-pre"
                        spellCheck={false}
                      />
                      
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-950/40 p-4 rounded-lg border border-kve-border text-xs">
                        <span className="text-[10px] text-slate-500 font-mono">Última atualização ativa: {lastRebuild}</span>
                        <button
                          onClick={handleNixosRebuild}
                          disabled={isBuilding}
                          className="px-4 py-2 bg-kve-accent text-kve-bg font-bold text-xs rounded hover:bg-kve-accent/90 transition-all flex items-center gap-2 self-end"
                        >
                          {isBuilding ? 'COMPILANDO FECHOS...' : 'APLICAR CONFIGURAÇÃO (NIXOS-REBUILD)'}
                        </button>
                      </div>
                      
                      {(isBuilding || buildLogs) && (
                        <div className="bg-black border border-kve-border rounded-xl p-4 font-mono text-[11px] text-kve-success h-56 overflow-y-auto space-y-1">
                          <div className="text-slate-500 border-b border-kve-border/20 pb-1 mb-2 uppercase text-[10px] font-bold tracking-widest">Nix Build Engine Terminal</div>
                          {buildLogs.split('\n').map((line, i) => (
                            <div key={i} className="leading-relaxed">{line}</div>
                          ))}
                          {isBuilding && (
                            <div className="flex items-center gap-2 mt-2">
                              <div className="w-1.5 h-1.5 bg-kve-success rounded-full animate-ping" />
                              <span className="animate-pulse text-slate-400">Aguardando ativação do Systemd...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </KveCard>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <KveCard title="Configurações de Rede" icon={<Network size={16} />}>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interface WAN (Internet)</label>
                      <input type="text" defaultValue="eth0 (192.168.1.100)" className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interface LAN (Nodes)</label>
                      <input type="text" defaultValue="eth1 (10.0.0.1/24)" className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors" />
                    </div>
                  </div>
                  <div className="flex items-center gap-6 p-4 rounded-xl bg-slate-900/40 border border-kve-border">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Servidor DHCP (dnsmasq)</p>
                      <p className="text-xs text-slate-500">Range: 10.0.0.100 - 10.0.0.250</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-4 bg-kve-accent rounded-full relative cursor-pointer">
                        <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full" />
                      </div>
                      <span className="text-[10px] font-bold text-kve-success uppercase tracking-widest">ATIVO</span>
                    </div>
                  </div>
                </div>
              </KveCard>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <KveCard title="Configurações BTRFS" icon={<HardDrive size={16} />}>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-kve-border">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Políticas de Snapshot</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 rounded bg-slate-800/50">
                        <span className="text-xs text-slate-300">Snapshots Diários (Manter 7 dias)</span>
                        <div className="w-8 h-4 bg-kve-accent rounded-full relative cursor-pointer">
                          <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-slate-800/50">
                        <span className="text-xs text-slate-300">Snapshots Semanais (Manter 4 semanas)</span>
                        <div className="w-8 h-4 bg-kve-accent rounded-full relative cursor-pointer">
                          <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </KveCard>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <KveCard title="Políticas de Acesso" icon={<Lock size={16} />}>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-kve-danger/5 border border-kve-danger/20">
                    <AlertTriangle className="text-kve-danger" size={24} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Autenticação de Dois Fatores (2FA)</p>
                      <p className="text-xs text-slate-500">Obrigatório para todos os administradores e operadores.</p>
                    </div>
                    <button className="px-4 py-2 rounded-lg bg-kve-danger text-white font-bold text-xs">DESATIVAR</button>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sessão Timeout (minutos)</label>
                      <input type="number" defaultValue="60" className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tentativas de Login (bloqueio)</label>
                      <input type="number" defaultValue="5" className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-kve-accent/50 transition-colors" />
                    </div>
                  </div>
                </div>
              </KveCard>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsView;
