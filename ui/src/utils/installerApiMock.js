import { InstallerApiError } from './installerApi.js';

export const installerApiMock = {
  getCountries() { return Promise.resolve([{ id: 'BR', name: 'Brasil (Mock)' }]); },
  getLocales() { return Promise.resolve([{ id: 'pt_BR.UTF-8', name: 'Portugues (Brasil) - Mock' }]); },
  getKeymaps() { return Promise.resolve([{ id: 'br-abnt2', name: 'Portugues (ABNT2)' }]); },
  getTimezones() { return Promise.resolve(['America/Cuiaba', 'America/Sao_Paulo']); },
  getTimezoneLocations() { return Promise.resolve({}); },
  
  getNetworkInterfaces() {
    return Promise.resolve({
      interfaces: [
        { name: 'eth0', type: 'ethernet', state: 'up', ipv4_address: '192.168.1.100/24' }
      ]
    });
  },
  
  getNetworkStatus() { return Promise.resolve({ connected: true, internet: true }); },
  
  applyNetwork(params) {
    return new Promise(resolve => setTimeout(() => resolve({ ok: true }), 1500));
  },
  
  scanWifi(iface) { return Promise.resolve({ networks: [] }); },
  connectWifi(iface, ssid, password) { return Promise.resolve({ ok: true }); },

  getHardware() {
    return Promise.resolve({
      cpu: 'Mocked Intel Core i9',
      memory_gb: 32,
      boot_mode: 'uefi',
      secure_boot: false,
    });
  },

  prepareGithubSource(repo, branch = 'main') {
    return new Promise(resolve => setTimeout(() => {
      resolve({
        ok: true,
        source: {
          kind: 'github',
          repo,
          branch,
          clone_path: '/run/kryxd/sources/kryonixos',
          target_path: '/etc/kryonixos',
          validated: true,
        }
      });
    }, 2000));
  },

  getDisks() {
    return Promise.resolve([
      {
        name: 'nvme0n1',
        path: '/mockdev/nvme0n1',
        model: 'Mocked NVMe SSD',
        size: '500G',
        size_bytes: 500000000000,
        type: 'disk',
        eligible: true,
        eligibilityIssues: []
      },
      {
        name: 'sda',
        path: '/mockdev/sda',
        model: 'Mocked USB Flash Drive',
        size: '16G',
        size_bytes: 16000000000,
        type: 'disk',
        removable: true,
        eligible: false,
        eligibilityIssues: ['Removable media is not supported.']
      }
    ]);
  },

  getDiskLayout(disk) { return Promise.resolve({}); },

  getDiskPartitions(device) {
    return Promise.resolve([
      { name: 'nvme0n1p1', sizeBytes: 512000000, type: 'part', fstype: 'vfat', label: 'EFI' },
      { name: 'nvme0n1p2', sizeBytes: 499000000000, type: 'part', fstype: 'ext4', label: 'ROOT' }
    ]);
  },

  async savePlan(planPayload, secretsPayload) {
    console.warn('[MOCK] savePlan called with:', planPayload);
    // Simulate validation
    const mode = planPayload.disk?.mode || planPayload.disk?.sysDisk;
    
    // Teste de validação rigorosa
    const validModes = ["destroy", "format", "mount", "destroy,format,mount", "format,mount"];
    if (!validModes.includes(mode)) {
      throw new InstallerApiError(
        'Modo de disco inválido.',
        {
          status: 422,
          body: {
            ok: false,
            code: "INVALID_DISK_MODE",
            message: "Modo de disco inválido.",
            action: "Volte para a etapa de discos e selecione um modo válido.",
            details: {
              field: "disk.mode",
              received: mode,
              accepted: validModes
            },
            recoverable: true,
            destructiveActionStarted: false,
            sessionId: "mock-session-1234"
          }
        }
      );
    }

    return new Promise(resolve => setTimeout(resolve, 800));
  },

  startInstall(_confirmWipe) {
    console.warn('[MOCK] startInstall triggered. Destructive actions blocked.');
    return new Promise(resolve => setTimeout(() => resolve({ job_id: 'mock-job-123' }), 500));
  },

  getStatus() {
    return Promise.resolve({ state: 'INSTALL_RUNNING' });
  },

  getLog() { return Promise.resolve({ tail: 'Mock log entry\n' }); },

  reboot() {
    console.warn('[MOCK] Reboot requested. Ignoring in mock mode.');
    return Promise.resolve({ ok: true });
  },

  openInstallLogStream(handlers = {}) {
    console.warn('[MOCK] openInstallLogStream connected.');
    
    let step = 0;
    const steps = [
      { s: 'precheck', m: 'Validating hardware requirements...', p: 10 },
      { s: 'partition', m: 'Mock: Formatting /mockdev/nvme0n1...', p: 30 },
      { s: 'nixos-install', m: 'Mock: Extracting system closure...', p: 60 },
      { s: 'nixos-install', m: 'Mock: Generating hardware configuration...', p: 80 },
      { s: 'nixos-install', m: 'Mock: Installing bootloader...', p: 90 },
      { s: 'done', m: 'Installation completed successfully (MOCK).', p: 100 }
    ];

    const interval = setInterval(() => {
      if (step < steps.length) {
        const evt = steps[step];
        const phase = evt.s === 'done' ? 'VERIFY' : evt.s === 'precheck' ? 'INPUT' : evt.s === 'partition' ? 'PARTITION' : 'INSTALL';
        
        handlers.onLog?.(`[${evt.s.toUpperCase()}] ${evt.m}\n`);
        handlers.onStatus?.({
          running: evt.s !== 'done' && evt.s !== 'error',
          exitCode: evt.s === 'done' ? 0 : null,
          currentPhase: phase,
          lastLogLine: evt.m,
          lastError: '',
          percent: evt.p,
        });

        if (evt.s === 'done') {
          clearInterval(interval);
          handlers.onDone?.(0);
        }
        step++;
      }
    }, 1500);

    return () => clearInterval(interval);
  },
};
