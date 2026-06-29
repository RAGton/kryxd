export class InstallerApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'InstallerApiError';
    this.status = details.status ?? null;
    this.body = details.body;
  }
}

async function parseResponseBody(response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function resolveApiErrorMessage(body, fallbackMessage) {
  if (typeof body === 'string' && body.trim()) {
    return body;
  }
  if (body && typeof body === 'object') {
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
    if (Array.isArray(body.checks)) {
      const failed = body.checks.filter(c => !c.ok && !c.passed);
      if (failed.length > 0) {
        return failed.map(c => c.message || c.error || 'Erro desconhecido').join('\n');
      }
    }
  }
  return fallbackMessage;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
  });
  const body = await parseResponseBody(response);

  if (!response.ok) {
    if (response.status === 401) {
      throw new InstallerApiError(
        'Não autorizado: Token de instalador inválido ou ausente.',
        { status: 401, body }
      );
    }
    throw new InstallerApiError(
      resolveApiErrorMessage(body, `Falha ao acessar ${path}.`),
      {
        status: response.status,
        body,
      },
    );
  }

  return body;
}

// Maps frontend planPayload + mode → backend InstallPlan type.
//
// SECURITY: A senha do administrador NUNCA entra neste payload.
// Ela trafega exclusivamente via buildInstallSecretsPayload (canal separado).
// Este payload contém apenas campos não-secretos.
function buildKryonixInstallPlan(planPayload, secretsPayload = {}, mode = 'install') {
  const layout = (planPayload.disk?.rootFs === 'btrfs') ? 'btrfs-simple' : 'lvm-simple';

  return {
    version: 1,
    hostname: planPayload.network?.hostname || 'kryonix',
    timezone: planPayload.locale?.timezone || 'America/Cuiaba',
    locale: planPayload.locale?.locale || 'pt_BR.UTF-8',
    keyboard: planPayload.locale?.keymap || 'br-abnt2',
    disk: {
      mode,
      target: planPayload.disk?.sysDisk || '',
      layout,
      boot_mode: 'uefi',
      profile: planPayload.disk?.profile || 'single',
      selectedDisks: planPayload.disk?.selectedDisks || [],
      raidLevel: planPayload.disk?.raidLevel,
      manualPartitions: planPayload.disk?.manualPartitions,
    },
    user: {
      name: planPayload.admin?.user || 'admin',
      admin: true,
      uid: planPayload.admin?.uid ?? 1000,
      email: planPayload.admin?.email || '',
      authorized_keys: Array.isArray(planPayload.admin?.authorizedKeys)
        ? planPayload.admin.authorizedKeys
        : [],
      hashedPassword: secretsPayload.adminPassword || '',
    },
    features: planPayload.features && typeof planPayload.features === 'object'
      ? planPayload.features
      : {},
    confirmed_features: Array.isArray(planPayload.confirmedFeatures)
      ? planPayload.confirmedFeatures
      : [],
    target_remote_access: {
      enabled: Boolean(planPayload.targetRemoteAccess?.enabled),
    },
    network: planPayload.network || {},
  };
}

import { installerApiMock } from './installerApiMock.js';

// Maps ProgressEvent.step → INSTALL_RUNTIME_PHASE label
const STEP_TO_PHASE = {
  precheck: 'INPUT',
  partition: 'PARTITION',
  PARTITION: 'PARTITION',
  'nixos-install': 'INSTALL',
  INSTALL: 'INSTALL',
  done: 'VERIFY',
  error: 'ERROR',
};

const realInstallerApi = {
  getCountries() { return Promise.resolve([{ id: 'BR', name: 'Brasil' }]); },
  getLocales() { return Promise.resolve([{ id: 'pt_BR.UTF-8', name: 'Portugues (Brasil)' }]); },
  getKeymaps() { return Promise.resolve([{ id: 'br-abnt2', name: 'Portugues (ABNT2)' }]); },
  getTimezones() { return Promise.resolve(['America/Cuiaba', 'America/Sao_Paulo']); },
  getTimezoneLocations() { return Promise.resolve({}); },
  // { interfaces: [{ name, type, state }] } — fonte de verdade = backend (nmcli)
  getNetworkInterfaces() { return requestJson('/network/interfaces'); },
  getNetworkStatus() { return requestJson('/network/status'); },
  applyNetwork(params) {
    return requestJson('/network/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
  },
  scanWifi(iface) {
    const path = iface ? `/network/wifi/scan?interface=${encodeURIComponent(iface)}` : '/network/wifi/scan';
    return requestJson(path);
  },
  connectWifi(iface, ssid, password) {
    // SECURITY: senha apenas em memória/trânsito; nunca persistida nem logada
    return requestJson('/network/wifi/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        interface: iface,
        ssid,
        password: password || null,
      }),
    });
  },

  getHardware() {
    return requestJson('/hardware');
  },

  prepareGithubSource(repo, branch = 'main') {
    return requestJson('/api/source/github/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo, branch }),
    });
  },
  startDeviceFlow() {
    return requestJson('/auth/github/device', { method: 'POST' });
  },
  pollDeviceFlow() {
    return requestJson('/auth/github/poll');
  },
  createFromTemplate(repoName, isPrivate, branch, templateRepo) {
    return requestJson('/api/source/github/create-from-template', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoName,
        private: isPrivate,
        branch,
        templateRepo
      }),
    });
  },
  getDisks() {
    return requestJson('/api/disks').then(disks => disks.map(d => ({
      name: d.name,
      path: d.path || (d.name ? `/dev/${d.name}` : ''),
      model: d.model,
      size: d.size,
      size_bytes: d.size_bytes,
      logical_size: d.size_bytes ?? d.size,
      type: d.type ?? d.type_,
      mountpoint: d.mountpoint,
      removable: d.removable,
      readonly: d.readonly,
      // elegibilidade vinda do backend (fonte de verdade); aceita snake_case
      eligible: d.eligible,
      eligibilityIssues: d.eligibilityIssues ?? d.eligibility_issues,
    })));
  },

  getDiskLayout(disk) { return Promise.resolve({}); },

  // Árvore de partições reais de um disco (lsblk children), para o "Atual" do
  // DiskVisualizer. Backend: GET /api/disks/:device/partitions (get_partitions),
  // que sanitiza o nome — passe o device curto (ex.: "sda"), nunca "/dev/sda".
  getDiskPartitions(device) {
    const name = String(device || '').trim().replace(/^\/dev\//, '');
    return requestJson(`/api/disks/${encodeURIComponent(name)}/partitions`).then((raw) => {
      const root = raw?.blockdevices?.[0] || {};
      const children = Array.isArray(root.children) ? root.children : [];
      return children.map((c) => ({
        name: c.name,
        path: c.name ? `/dev/${c.name}` : '',
        sizeBytes: Number(c.size ?? c.size_bytes ?? 0),
        type: c.type ?? c.type_,
        fstype: c.fstype ?? '',
        mountpoint: c.mountpoint ?? null,
        label: c.label ?? '',
      }));
    });
  },

  // Validate the plan via backend dry-run before committing to install.
  // Throws InstallerApiError if any check fails so the hook surfaces the error.
  async savePlan(planPayload, secretsPayload) {
    const kryonixPlan = buildKryonixInstallPlan(planPayload, secretsPayload, 'dry-run');
    window.__kryonix_install_plan = kryonixPlan;

    const result = await requestJson('/dry-run', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'X-Kryonix-Installer-Token': sessionStorage.getItem('installer_token') || '',
      },
      body: JSON.stringify(kryonixPlan),
    });

    if (result && !result.ok) {
      const failedCheck = result.checks?.find(c => !c.ok);
      throw new InstallerApiError(
        failedCheck?.message || 'Validação do plano falhou no backend.',
        { status: 422, body: result },
      );
    }
  },

  // POST /install with disk.mode="install". Backend runs safety checks first.
  // Returns 202 + { job_id } on success, throws 403 if safety checks fail.
  startInstall(_confirmWipe) {
    const kryonixPlan = window.__kryonix_install_plan
      ? { ...window.__kryonix_install_plan, disk: { ...window.__kryonix_install_plan.disk, mode: 'install' } }
      : null;

    if (!kryonixPlan) {
      return Promise.reject(new InstallerApiError('Plano não encontrado. Execute savePlan primeiro.'));
    }

    window.__kryonix_running = true;
    return requestJson('/install', {
      method: 'POST',
      headers: { 
        'content-type': 'application/json',
        'X-Kryonix-Installer-Token': sessionStorage.getItem('installer_token') || '',
      },
      body: JSON.stringify(kryonixPlan),
    });
  },

  getStatus() {
    return requestJson('/install/status');
  },

  getLog() { return Promise.resolve({ tail: '' }); },

  reboot() {
    return requestJson('/api/reboot', { method: 'POST' });
  },

  // Connect to /install/progress SSE and map ProgressEvent → hook handlers.
  openInstallLogStream(handlers = {}) {
    const source = new EventSource('/install/progress');

    source.onmessage = (event) => {
      let evt;
      try {
        evt = JSON.parse(event.data);
      } catch {
        handlers.onLog?.(`${event.data}\n`);
        return;
      }

      const { step, message, percent } = evt;
      const phase = STEP_TO_PHASE[step] || 'INSTALL';

      // Always emit the raw line to the terminal
      handlers.onLog?.(`[${step.toUpperCase()}] ${message}\n`);

      // Update phase display
      handlers.onStatus?.({
        running: step !== 'done' && step !== 'error',
        exitCode: step === 'done' ? 0 : step === 'error' ? 1 : null,
        currentPhase: phase,
        lastLogLine: message,
        lastError: step === 'error' ? message : '',
        percent,
      });

      if (step === 'done') {
        window.__kryonix_running = false;
        handlers.onDone?.(0);
        source.close();
      } else if (step === 'error') {
        window.__kryonix_running = false;
        handlers.onDone?.(1);
        source.close();
      }
    };

    source.onerror = () => {
      source.close();
      handlers.onError?.();
    };

    return () => source.close();
  },
};

export const installerApi = import.meta.env.VITE_INSTALLER_MOCK === '1'
  ? installerApiMock
  : realInstallerApi;

export function getInstallerApiErrorMessage(error, fallbackMessage = 'Falha ao comunicar com o backend do instalador.') {
  if (error instanceof InstallerApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}
