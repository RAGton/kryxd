import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import installPlanSchema from '../generated/installPlanSchema.js';
import {
  createInstallPlanDraft,
  extractUiTransientState,
} from '../state/wizardState.js';
import { FEATURE_CATALOG } from '../data/featureCatalog.js';
import { PROFILE_CATALOG } from '../data/profileCatalog.js';

import { INSTALL_PLAN_VERSION } from '../generated/installPlanVersion.js';
import { CAPABILITY_BY_ID } from '../generated/capabilities.js';

export { INSTALL_PLAN_VERSION };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(installPlanSchema);

const ipv4Pattern = /^((25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const timezonePattern = /^(?:[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+|Etc\/UTC)$/;

function sanitizeString(value) {
  return String(value || '').trim();
}

function csvToArray(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAuthorizedKeys(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function sanitizeDnsList(value) {
  return Array.from(
    new Set(
      csvToArray(value).filter((item) => ipv4Pattern.test(item)),
    ),
  );
}

function hasOnlyValidDnsItems(value) {
  const items = csvToArray(value);
  return items.length > 0 && items.every((item) => ipv4Pattern.test(item));
}

function netmaskToPrefix(netmask) {
  const normalized = sanitizeString(netmask);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let bits = 0;
  let seenZero = false;

  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }

    for (let bit = 7; bit >= 0; bit -= 1) {
      const current = (octet >> bit) & 1;
      if (current === 1) {
        if (seenZero) {
          return null;
        }
        bits += 1;
      } else {
        seenZero = true;
      }
    }
  }

  return bits;
}

function isValidIpv4(value) {
  return ipv4Pattern.test(sanitizeString(value));
}

function isValidHostname(value) {
  const host = sanitizeString(value);
  if (!host || host.length > 63) {
    return false;
  }
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(host);
}

export function isStrongPassword(value) {
  const password = String(value || '');
  if (password.length < 12) {
    return false;
  }

  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9\s]/.test(password)) classes += 1;
  return classes >= 3;
}

function isCanonicalTimezone(value) {
  return timezonePattern.test(sanitizeString(value));
}

function uniqueStrings(items) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => sanitizeString(item)).filter(Boolean)));
}

function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) {
    return 'plano inválido';
  }

  return errors
    .map((error) => {
      const path = error.instancePath || 'plano';
      const message = error.message || 'valor inválido';
      return `${path} ${message}`.trim();
    })
    .join('; ');
}



export function buildInstallPlanPayload(draftInput) {
  const draft = createInstallPlanDraft(draftInput);
  const storageMode = sanitizeString(draft.storageMode) || 'automatic';
  const diskProfile = storageMode === 'automatic' ? (sanitizeString(draft.diskProfile) || 'single') : storageMode;
  const requestedDiskMode = sanitizeString(draft.diskMode) === 'two' ? 'two' : 'one';
  const sysDisk = sanitizeString(draft.sysDisk);
  const dataDiskCandidate = sanitizeString(draft.dataDisk);
  const isThinkServer = Boolean(draft.isThinkServer);
  
  // Para RAID, os discos vêm do raidPlan se disponível
  const raidMembers = storageMode === 'raid' && draft.raidPlan?.devices ? draft.raidPlan.devices : uniqueStrings(draft.selectedDisks);
  
  // Para LVM, os discos vêm do lvmPlan
  const lvmMembers = storageMode === 'lvm' && draft.lvmPlan?.physicalVolumes ? draft.lvmPlan.physicalVolumes : [];

  const diskMode = (diskProfile === 'raid' || diskProfile === 'manual' || diskProfile === 'lvm') ? 'one' : requestedDiskMode;

  const selectedDisks = diskProfile === 'raid'
    ? uniqueStrings(raidMembers.length > 0 ? raidMembers : [sysDisk])
    : diskProfile === 'manual'
      ? uniqueStrings([sysDisk, ...(draft.manualPartitions || []).map(p => p.device)].filter(Boolean))
      : diskProfile === 'lvm'
        ? uniqueStrings(lvmMembers.length > 0 ? lvmMembers : [sysDisk])
        : uniqueStrings([sysDisk, ...(diskMode === 'two' ? [dataDiskCandidate] : [])].filter(Boolean));

  const dataDisk = diskProfile === 'single' && diskMode === 'two' ? dataDiskCandidate || undefined : undefined;
  const mgmtPrefix = netmaskToPrefix(draft.mgmtNetmask) ?? 0;
  const wanPrefix = netmaskToPrefix(draft.wanNetmask);
  const wanInterface = sanitizeString(draft.wanInterface);
  const wanEnabled = wanInterface !== '';
  const wanMode = wanEnabled ? sanitizeString(draft.wanMode) || 'dhcp' : 'dhcp';

  const profileObj = PROFILE_CATALOG.find(p => p.id === draft.profileId) || PROFILE_CATALOG.find(p => p.id === 'desktop');
  const selectedFeatures = Array.isArray(draft.selectedFeatures) ? draft.selectedFeatures : [];

  const features = {
    system: {},
    user: {},
    storage: {},
    security: {},
    remote: {},
    ai: {},
    server: {},
    desktop: {},
    dev: {},
    mcp: {},
    virtualization: {},
    network: {},
    observability: {},
    shell: {},
    terminal: {},
    editor: {},
    obsidian: {}
  };

  for (const featId of selectedFeatures) {
    const feat = FEATURE_CATALOG.find(f => f.id === featId);
    if (feat) {
      // Backend constructs feature_id = "{domain}.{key}" via classify_feature.
      // The key must be the SHORT name (part after the domain dot), not the full ID.
      // Features are stored ONLY under their domain bucket — not also under level —
      // to avoid the backend iterating the same feature twice with conflicting domains
      // (e.g. "system.ollama" → Unknown vs "ai.ollama" → Partial).
      const dotIdx = featId.indexOf('.');
      const shortKey = dotIdx >= 0 ? featId.slice(dotIdx + 1) : featId;
      if (features[feat.domain]) {
        features[feat.domain][shortKey] = true;
      }
    }
  }


  // /srv/data ativa para: features de IA que exigem volume persistente,
  // storage.srv-data explicito, e perfis ai-local/full.
  // Profile "server" exige selecao manual de storage.srv-data (nao auto-ativa).
  const enableSrvData =
    features.storage['srv-data'] === true ||
    features.ai['ollama'] === true ||
    features.ai['kryonix-brain'] === true ||
    features.ai['neo4j'] === true ||
    features.ai['lightrag'] === true ||
    features.ai['open-webui'] === true ||
    draft.profileId === 'ai-local' ||
    draft.profileId === 'server-ai' ||
    draft.profileId === 'full';

  const confirmedFeatures = selectedFeatures
    .map(featId => FEATURE_CATALOG.find(f => f.id === featId))
    .filter(f => f?.status === 'partial')
    .map(f => f.id);

  const topology = isThinkServer ? 'single' : (diskMode === 'two' ? 'split' : 'single');
  const unsupportedStorage = diskProfile === 'raid' || diskProfile === 'manual' || storageMode === 'lvm';
  if (unsupportedStorage) {
    throw new Error('A topologia RAID, manual ou LVM ainda é unsupported no InstallPlanV2.');
  }
  if (draft.luksEnabled) {
    throw new Error('LUKS2 ainda é unsupported no InstallPlanV2.');
  }
  if (selectedDisks.length === 0 || !sysDisk) {
    throw new Error('O InstallPlanV2 exige pelo menos um disco de sistema.');
  }
  if (topology === 'split' && !dataDisk) {
    throw new Error('O layout split exige um disco de dados.');
  }

  const rootFilesystem = isThinkServer ? 'zfs' : (sanitizeString(draft.rootFs) || 'btrfs');
  const dataFilesystem = sanitizeString(draft.dataFs) || 'btrfs';
  const supportedFilesystems = new Set(['btrfs', 'zfs', 'ext4', 'xfs']);
  if (!supportedFilesystems.has(rootFilesystem) || !supportedFilesystems.has(dataFilesystem)) {
    throw new Error('Filesystem desconhecido no InstallPlanV2.');
  }
  const zfsQuota = sanitizeString(draft.zfsUserRefquota);
  const btrfsQgroup = sanitizeString(draft.btrfsUserQgroupLimit);
  if ((rootFilesystem === 'zfs' || dataFilesystem === 'zfs') && !zfsQuota) {
    throw new Error('ZFS exige zfsUserRefquota configurado.');
  }
  if (topology === 'split' && dataFilesystem === 'btrfs' && !btrfsQgroup) {
    throw new Error('BTRFS de dados exige btrfsUserQgroupLimit configurado.');
  }

  for (const featId of selectedFeatures) {
    const capability = CAPABILITY_BY_ID[featId];
    if (!capability) {
      throw new Error(`Capability não registrada: ${featId}`);
    }
    if (capability.status === 'unsupported') {
      throw new Error(`Capability unsupported: ${featId}`);
    }
    for (const requiredId of capability.requires || []) {
      if (!selectedFeatures.includes(requiredId)) {
        throw new Error(`${featId} exige a capability ${requiredId}.`);
      }
    }
    for (const conflictId of capability.conflicts || []) {
      if (selectedFeatures.includes(conflictId)) {
        throw new Error(`${featId} conflita com ${conflictId}.`);
      }
    }
  }

  const repositoryUrl = sanitizeString(draft.sourceRepoUrl) || 'https://github.com/RAGton/kryonixos';
  const upstreamUrl = sanitizeString(draft.templateRepoUrl) || 'https://github.com/RAGton/kryonixos';
  const root = { filesystem: rootFilesystem, encryption: 'none' };
  const data = topology === 'split' ? { filesystem: dataFilesystem, encryption: 'none' } : null;
  const storage = {
    topology,
    systemDisks: [sysDisk],
    dataDisks: topology === 'split' ? [dataDisk] : [],
    root,
    data,
    raidLevel: null,
    manualPartitions: [],
    zfs: rootFilesystem === 'zfs' || dataFilesystem === 'zfs' ? { userRefquota: zfsQuota } : null,
    btrfs: topology === 'split' && dataFilesystem === 'btrfs' ? { userQgroupLimit: btrfsQgroup } : null,
  };

  return {
    version: INSTALL_PLAN_VERSION,
    isThinkServer,
    repository: {
      coreUrl: 'https://github.com/RAGton/kryonix',
      upstreamUrl,
      downstreamUrl: repositoryUrl,
      branch: sanitizeString(draft.sourceBranch) || 'main',
    },
    storage,
    features,
  };
}

export function buildInstallPlanV2(wizardState) {
  return buildInstallPlanPayload(wizardState);
}

export function buildInstallSecretsPayload(draftInput) {
  const draft = createInstallPlanDraft(draftInput);
  const wanMode = sanitizeString(draft.wanMode) || 'dhcp';

  return {
    adminPassword: String(draft.adminPassword || ''),
    adminPasswordConfirm: String(draft.adminPasswordConfirm || ''),
    wanPppoePassword: wanMode === 'pppoe' ? String(draft.pppoePassword || '') : undefined,
  };
}

export { extractUiTransientState };

export function validateInstallPlanPayload(payload) {
  const valid = validateSchema(payload);
  if (!valid) {
    throw new Error(formatAjvErrors(validateSchema.errors));
  }
  return payload;
}

export function validateInstallPlanV2(plan) {
  return validateInstallPlanPayload(plan);
}

export function getInstallPlanCompatibilityIssues(payload) {
  const issues = [];

  if (payload?.storage?.topology === 'raid' && payload?.storage?.filesystem !== 'btrfs') {
    issues.push('No modo RAID, o filesystem raiz suportado pelo backend atual é btrfs.');
  }

  return issues;
}

function createValidationResult() {
  return {
    fieldErrors: {},
    blockingIssues: [],
    warnings: [],
  };
}

function addMessage(list, message) {
  if (message && !list.includes(message)) {
    list.push(message);
  }
}

function addFieldError(result, field, message, { blocking = true } = {}) {
  if (!result.fieldErrors[field]) {
    result.fieldErrors[field] = message;
  }
  if (blocking) {
    addMessage(result.blockingIssues, message);
  } else {
    addMessage(result.warnings, message);
  }
}

function addBlockingIssue(result, message) {
  addMessage(result.blockingIssues, message);
}

function addWarning(result, message) {
  addMessage(result.warnings, message);
}

function appendStorageUiValidation(result, uiState) {
  const blockingIssues = Array.isArray(uiState?.storageBlockingIssues) ? uiState.storageBlockingIssues : [];
  const warnings = Array.isArray(uiState?.storageWarnings) ? uiState.storageWarnings : [];

  for (const issue of blockingIssues) {
    addBlockingIssue(result, issue);
  }

  for (const warning of warnings) {
    addWarning(result, warning);
  }
}

// Regra de senha unica: vazia nunca aceita; confirmacao sempre obrigatoria;
// regra de FORCA so cai sob allowWeakPassword (modo laboratorio).
function validatePasswordRules(secrets, allowWeak, result) {
  if (!secrets.adminPassword) {
    addFieldError(result, 'adminPassword', 'Informe a senha do administrador.');
  } else if (!allowWeak && !isStrongPassword(secrets.adminPassword)) {
    addFieldError(result, 'adminPassword', 'Use uma senha forte com 12+ caracteres e 3 classes de caracteres.');
  }

  if (secrets.adminPassword !== secrets.adminPasswordConfirm) {
    addFieldError(result, 'adminPasswordConfirm', 'Senha e confirmação não conferem.');
  }
}

function validateAdminStep(payload, secrets, result, draft) {
  if (!payload.admin.user) addFieldError(result, 'adminUser', 'Informe o usuário administrador.');
  if (!payload.admin.fullName) addFieldError(result, 'adminFullName', 'Informe o nome completo do administrador.');
  if (!payload.admin.email) {
    addFieldError(result, 'adminEmail', 'Informe o e-mail do administrador.');
  } else if (!emailPattern.test(payload.admin.email)) {
    addFieldError(result, 'adminEmail', 'Informe um e-mail válido.');
  }

  validatePasswordRules(secrets, Boolean(draft?.allowWeakPassword), result);
}

function validateFinalDraft(draft, secrets, result) {
  try {
    const plan = buildInstallPlanV2(draft);
    validateInstallPlanV2(plan);
    for (const compatibilityIssue of getInstallPlanCompatibilityIssues(plan)) {
      addBlockingIssue(result, compatibilityIssue);
    }
  } catch (error) {
    addBlockingIssue(result, error instanceof Error ? error.message : 'Plano inválido.');
  }

  validatePasswordRules(secrets, Boolean(draft.allowWeakPassword), result);

  if (draft.allowWeakPassword) {
    addWarning(result, 'Senha forte ignorada por modo laboratório (allowWeakPassword).');
  }
}

function buildValidationProjection(draft) {
  const wanInterface = sanitizeString(draft.wanInterface);
  const wanMode = sanitizeString(draft.wanMode) || 'dhcp';
  const topology = draft.diskProfile === 'raid' || draft.diskProfile === 'manual'
    ? draft.diskProfile
    : (draft.diskMode === 'two' ? 'split' : 'single');
  return {
    locale: {
      country: sanitizeString(draft.country),
      timezone: sanitizeString(draft.timeZone),
      locale: sanitizeString(draft.systemLocale),
      keymap: sanitizeString(draft.consoleKeymap),
    },
    network: {
      interface: sanitizeString(draft.mgmtInterface),
      mode: sanitizeString(draft.mgmtMode) || 'dhcp',
      httpPort: Number(draft.httpPort),
      wan: { interface: wanInterface, mode: wanMode, pppoeUser: sanitizeString(draft.pppoeUser) },
    },
    storage: {
      topology,
      target_disks: Array.isArray(draft.selectedDisks) ? uniqueStrings(draft.selectedDisks) : [],
      boot_disk: sanitizeString(draft.sysDisk),
    },
    admin: {
      user: sanitizeString(draft.adminUser),
      fullName: sanitizeString(draft.adminFullName),
      email: sanitizeString(draft.adminEmail),
      uid: 1000,
    },
  };
}

export function validateStep(stepId, draftInput, uiInput = {}) {
  const draft = createInstallPlanDraft(draftInput);
  const uiState = extractUiTransientState(uiInput);
  const payload = buildValidationProjection(draft);
  const secrets = buildInstallSecretsPayload(draft);
  const result = createValidationResult();

  switch (stepId) {
    case 'welcome':
      return result;
    case 'eula':
      if (!uiState.eulaAccepted) {
        addBlockingIssue(result, 'É necessário aceitar os termos e o aviso de destruição de dados.');
      }
      return result;
    case 'source':
      if (draft.sourceKind === 'github-user-repo') {
        if (!draft.sourceRepoUrl || draft.sourceRepoUrl.trim() === '') {
          addBlockingIssue(result, 'Informe a URL do repositório GitHub.');
        } else if (!uiState.githubSourceStatus || uiState.githubSourceStatus !== 'ready') {
          addBlockingIssue(result, 'A fonte do repositório precisa estar validada e pronta para avançar.');
        }
      } else if (draft.sourceKind === 'github-create-from-template') {
        addBlockingIssue(result, 'Criação de repositório em breve. Por favor, escolha outra opção.');
      }
      return result;
    case 'localization':
      if (!payload.locale.country) addFieldError(result, 'country', 'Selecione um país/região.');
      if (!payload.locale.locale) addFieldError(result, 'locale', 'Selecione um idioma/locale.');
      if (!payload.locale.keymap) addFieldError(result, 'keyMap', 'Selecione um layout de teclado.');
      return result;
    case 'timezone':
      if (!payload.locale.timezone) {
        addFieldError(result, 'timeZone', 'Selecione um timezone válido.');
      } else if (!isCanonicalTimezone(payload.locale.timezone)) {
        addFieldError(result, 'timeZone', 'Selecione um timezone IANA canônico.');
      }
      return result;
    case 'network':
      // Requisito de avanço: estar online OU ter escolhido modo offline explicitamente.
      if (!uiState.netConnected && !uiState.netOffline) {
        addBlockingIssue(result, 'Conecte-se à internet ou selecione "Continuar offline" para prosseguir.');
      }

      if (!payload.network.interface) addFieldError(result, 'mgmtInterface', 'Selecione a interface LAN.');
      if (payload.network.interface && payload.network.wan.interface && payload.network.interface === payload.network.wan.interface) {
        addBlockingIssue(result, 'LAN e WAN devem usar placas distintas.');
      }
      // IP/máscara/gateway/DNS só são exigidos no modo manual (estático).
      // Em DHCP esses valores vêm automaticamente da rede.
      if (payload.network.mode === 'static') {
        if (!isValidIpv4(draft.serverIp)) addFieldError(result, 'serverIp', 'IP do servidor inválido.');
        if (!isValidIpv4(draft.mgmtNetmask)) addFieldError(result, 'mgmtNetmask', 'Máscara de gerenciamento inválida.');
        if (!isValidIpv4(draft.mgmtGateway)) addFieldError(result, 'mgmtGateway', 'Gateway inválido.');
        if (!hasOnlyValidDnsItems(draft.mgmtDns)) addFieldError(result, 'mgmtDns', 'DNS deve conter IPv4 válidos separados por vírgula.');
      }
      if (!(Number(payload.network.httpPort) >= 1 && Number(payload.network.httpPort) <= 65535)) {
        addFieldError(result, 'httpPort', 'Porta HTTP deve ficar entre 1 e 65535.');
      }

      if (payload.network.wan.interface && payload.network.wan.mode === 'static') {
        if (!isValidIpv4(draft.wanAddress)) addFieldError(result, 'wanAddress', 'IP WAN inválido.');
        if (!isValidIpv4(draft.wanNetmask)) addFieldError(result, 'wanNetmask', 'Máscara WAN inválida.');
        if (!isValidIpv4(draft.wanGateway)) addFieldError(result, 'wanGateway', 'Gateway WAN inválido.');
        if (!hasOnlyValidDnsItems(draft.wanDns)) addFieldError(result, 'wanDns', 'DNS WAN deve conter IPv4 válidos separados por vírgula.');
      }

      if (payload.network.wan.interface && payload.network.wan.mode === 'pppoe') {
        if (!payload.network.wan.pppoeUser) addFieldError(result, 'pppoeUser', 'PPPoE: informe o usuário.');
        if (!secrets.wanPppoePassword) addFieldError(result, 'pppoePassword', 'PPPoE: informe a senha.');
      }

      if (payload.network.wan.interface && !uiState.wanIdentified) {
        addWarning(result, 'A porta WAN ainda não foi confirmada fisicamente.');
      }
      if (!uiState.lanIdentified) {
        addWarning(result, 'A porta LAN ainda não foi confirmada fisicamente.');
      }
      return result;
    case 'hostSelection':
      if (!isValidHostname(draft.hostName)) addFieldError(result, 'hostName', 'Hostname inválido para um servidor Linux.');
      return result;
    case 'disks': {
      const selectedDisks = payload.storage.target_disks;
      const rawSelection = Array.isArray(draft.selectedDisks) ? draft.selectedDisks : [];
      const uniqueSelection = uniqueStrings(rawSelection);
      if (uniqueSelection.length !== rawSelection.length) addFieldError(result, 'selectedDisks', 'A selecao contem discos duplicados.');
      if (selectedDisks.length === 0) addFieldError(result, 'selectedDisks', 'Selecione pelo menos 1 disco físico.');
      if (!payload.storage.boot_disk) addFieldError(result, 'sysDisk', 'Escolha o disco do sistema.');
      if (payload.storage.boot_disk && selectedDisks.length > 0 && !selectedDisks.includes(payload.storage.boot_disk)) {
        addFieldError(result, 'sysDisk', 'O disco do sistema precisa fazer parte da selecao atual.');
      }

      if (payload.storage.topology === 'raid') {
        // Bloqueio do RAID porque é um preview (ainda não suportado integralmente no backend)
        addBlockingIssue(result, 'Este modo ainda requer suporte do executor backend para instalação real.');

        const minByLevel = { raid0: 2, raid1: 2, raid5: 3, raid10: 4 };
        const raidLevel = draft.raidPlan?.level || draft.raidLevel;
        const minRequired = minByLevel[raidLevel] || 2;
        if (selectedDisks.length < minRequired) {
          addFieldError(result, 'selectedDisks', `${String(raidLevel || 'RAID').toUpperCase()} exige pelo menos ${minRequired} discos físicos.`);
        }
        if (raidLevel === 'raid10' && selectedDisks.length % 2 !== 0) {
          addFieldError(result, 'selectedDisks', 'RAID 10 exige quantidade par de discos.');
        }
      } else if (payload.storage.topology === 'manual') {
        addBlockingIssue(result, 'Este modo ainda requer suporte do executor backend para instalação real.');
        
        const manual = draft.manualPartitions || [];
        const hasRoot = manual.some(p => p.mountpoint === '/');
        const hasEfi = manual.some(p => p.mountpoint === '/boot/efi' || p.mountpoint === '/efi');
        if (!hasRoot) addBlockingIssue(result, 'Partição raiz (/) é obrigatória no modo manual.');
        if (!hasEfi) addBlockingIssue(result, 'Partição EFI (/boot/efi ou /efi) é obrigatória.');
      } else if (payload.storage.topology === 'lvm') {
        addBlockingIssue(result, 'Este modo ainda requer suporte do executor backend para instalação real.');
        
        if (!draft.lvmPlan?.vgName) addFieldError(result, 'lvmPlan.vgName', 'Informe o nome do Volume Group.');
        const lvs = draft.lvmPlan?.logicalVolumes || [];
        if (!lvs.some(lv => lv.mountpoint === '/')) addBlockingIssue(result, 'Volume Lógico raiz (/) é obrigatório.');
      } else if (payload.storage.topology === 'split') {
        if (selectedDisks.length !== 2) {
          addFieldError(result, 'selectedDisks', 'O layout split exige exatamente 2 discos distintos.');
        }
      } else if (selectedDisks.length !== 1) {
        addFieldError(result, 'selectedDisks', 'O layout single disk exige exatamente 1 disco.');
      }

      if (payload.storage.topology === 'split') {
        if (!draft.dataDisk) addFieldError(result, 'dataDisk', 'Escolha o disco de dados.');
        if (draft.dataDisk && draft.dataDisk === draft.sysDisk) {
          addFieldError(result, 'dataDisk', 'Disco de dados não pode ser igual ao disco do sistema.');
        }
      } else if (payload.storage.topology !== 'raid' && draft.dataDisk) {
        addFieldError(result, 'dataDisk', 'Single disk não usa disk.dataDisk.');
      }

      appendStorageUiValidation(result, uiState);
      return result;
    }
    case 'users':
      validateAdminStep(payload, secrets, result, draft);
      return result;
    case 'summary':
      validateFinalDraft(draft, secrets, result);
      appendStorageUiValidation(result, uiState);
      if (!uiState.destructiveConfirmed) {
        addBlockingIssue(result, 'Confirme o aviso destrutivo para continuar.');
      }
      return result;
    case 'install':
      validateFinalDraft(draft, secrets, result);
      appendStorageUiValidation(result, uiState);
      if (!uiState.destructiveConfirmed) {
        addBlockingIssue(result, 'Confirme o wipe de discos antes de iniciar.');
      }
      return result;
    default:
      return result;
  }
}
