export const WIZARD_STORAGE_KEY = 'kryonix.installer.wizard.v1';

export const DRAFT_FIELD_NAMES = [
  'sourceKind',
  'sourceRepoUrl',
  'sourceBranch',
  'templateRepoUrl',
  'sourceClonePath',
  'sourceTargetPath',
  'sourceValidated',
  'profileId',
  'selectedFeatures',
  'targetRemoteAccessEnabled',
  'uiLanguage',
  'systemLocale',
  'country',
  'keyboardLayout',
  'keyboardVariant',
  'consoleKeymap',
  'timeZone',
  'hostName',
  'mgmtInterface',
  'mgmtMode',
  'wanInterface',
  'wanMode',
  'pppoeUser',
  'pppoePassword',
  'wanAddress',
  'wanNetmask',
  'wanGateway',
  'wanDns',
  'serverIp',
  'mgmtNetmask',
  'mgmtGateway',
  'mgmtDns',
  'httpPort',
  'diskMode',
  'diskProfile',
  'selectedDisks',
  'raidLevel',
  'luksEnabled',
  'sysDisk',
  'dataDisk',
  'rootFs',
  'dataFs',
  'manualPartitions',
  'adminUser',
  'adminFullName',
  'adminEmail',
  'adminPassword',
  'adminPasswordConfirm',
  'allowWeakPassword',
  'adminAuthorizedKeys',
  'storageMode',
  'lvmPlan',
  'raidPlan',
  'isThinkServer',
];

export const UI_TRANSIENT_FIELD_NAMES = [
  'eulaAccepted',
  'timeZonePin',
  'timeZoneLatitude',
  'timeZoneLongitude',
  'timeZoneCountryCode',
  'netIfacesCount',
  'netConnected',
  'netOffline',
  'netApplyError',
  'netApplyBusy',
  'networkDhcpPending',
  'wanIdentified',
  'lanIdentified',
  'storageProfile',
  'storageBlockingIssues',
  'storageWarnings',
  'destructiveConfirmed',
  'installRunning',
  'githubSourceStatus',
  'githubSourceError',
];

const DRAFT_FIELD_SET = new Set(DRAFT_FIELD_NAMES);
const UI_TRANSIENT_FIELD_SET = new Set(UI_TRANSIENT_FIELD_NAMES);

export const INITIAL_INSTALL_PLAN_DRAFT = {
  sourceKind: 'offline-defaults',
  sourceRepoUrl: '',
  sourceBranch: 'main',
  templateRepoUrl: 'https://github.com/RAGton/Kryonixos.git',
  sourceClonePath: '/run/kryonix-installer/sources/kryonixos',
  sourceTargetPath: '/etc/kryonixos',
  sourceValidated: false,
  sourceStatus: "idle",
  sourceError: null,

  templateRepoUrl: "https://github.com/RAGton/Kryonixos.git",

  githubAuthStatus: "idle",
  githubDeviceCode: null,
  githubUserCode: null,
  githubVerificationUri: null,
  githubTokenReady: false,

  createRepoName: "kryonixos",
  createRepoPrivate: true,
  createdRepoUrl: "",
  profileId: 'desktop',
  selectedFeatures: [],
  targetRemoteAccessEnabled: false,
  uiLanguage: 'pt-BR',
  systemLocale: 'pt_BR.UTF-8',
  country: 'BR',
  keyboardLayout: 'br',
  keyboardVariant: 'abnt2',
  consoleKeymap: 'br-abnt2',
  timeZone: 'America/Cuiaba',
  hostName: 'kryonix-e2e',
  mgmtInterface: '',
  mgmtMode: 'dhcp',
  wanInterface: '',
  wanMode: 'dhcp',
  pppoeUser: '',
  pppoePassword: '',
  wanAddress: '',
  wanNetmask: '255.255.255.0',
  wanGateway: '',
  wanDns: '',
  serverIp: '',
  mgmtNetmask: '255.255.255.0',
  mgmtGateway: '',
  mgmtDns: '1.1.1.1,8.8.8.8',
  httpPort: 8080,
  diskMode: 'one',
  diskProfile: 'single',
  selectedDisks: [],
  raidLevel: 'raid1',
  luksEnabled: false,
  sysDisk: '',
  dataDisk: '',
  rootFs: 'btrfs',
  dataFs: 'btrfs',
  manualPartitions: [],
  adminUser: 'rag',
  adminFullName: '',
  adminEmail: 'admin@localhost',
  adminPassword: '',
  adminPasswordConfirm: '',
  allowWeakPassword: false,
  adminAuthorizedKeys: '',
  storageMode: 'automatic',
  lvmPlan: {
    vgName: 'kryonix-vg',
    physicalVolumes: [],
    logicalVolumes: [],
  },
  raidPlan: {
    level: 'raid1',
    devices: [],
    filesystem: 'btrfs',
    mountpoint: '/',
  },
  isThinkServer: false,
};

export const INITIAL_UI_TRANSIENT_STATE = {
  eulaAccepted: false,
  timeZonePin: null,
  timeZoneLatitude: null,
  timeZoneLongitude: null,
  timeZoneCountryCode: '',
  netIfacesCount: 0,
  netConnected: false,
  netOffline: false,
  netApplyError: '',
  netApplyBusy: false,
  networkDhcpPending: false,
  wanIdentified: false,
  lanIdentified: false,
  storageProfile: 'single-btrfs-subvol',
  storageBlockingIssues: [],
  storageWarnings: [],
  destructiveConfirmed: false,
  installRunning: false,
  githubSourceStatus: 'idle',
  githubSourceError: '',
};

function pickFields(source, defaults, allowedFields) {
  const next = { ...defaults };
  if (!source || typeof source !== 'object') {
    return next;
  }

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      next[field] = source[field];
    }
  }

  if (allowedFields.includes('selectedFeatures') && !Array.isArray(next.selectedFeatures)) {
    next.selectedFeatures = [];
  }

  if (allowedFields.includes('selectedDisks') && !Array.isArray(next.selectedDisks)) {
    next.selectedDisks = [];
  }

  if (allowedFields.includes('storageBlockingIssues') && !Array.isArray(next.storageBlockingIssues)) {
    next.storageBlockingIssues = [];
  }

  if (allowedFields.includes('storageWarnings') && !Array.isArray(next.storageWarnings)) {
    next.storageWarnings = [];
  }

  return next;
}

export function createInstallPlanDraft(source = {}) {
  return pickFields(source, INITIAL_INSTALL_PLAN_DRAFT, DRAFT_FIELD_NAMES);
}

export function extractUiTransientState(source = {}) {
  return pickFields(source, INITIAL_UI_TRANSIENT_STATE, UI_TRANSIENT_FIELD_NAMES);
}

export function splitWizardPatch(patch = {}) {
  const draftPatch = {};
  const uiPatch = {};

  for (const [key, value] of Object.entries(patch)) {
    if (DRAFT_FIELD_SET.has(key)) {
      draftPatch[key] = value;
      continue;
    }
    if (UI_TRANSIENT_FIELD_SET.has(key)) {
      uiPatch[key] = value;
    }
  }

  return {
    draftPatch,
    uiPatch,
  };
}

export function mergeWizardState(draft, uiState) {
  return {
    ...createInstallPlanDraft(draft),
    ...extractUiTransientState(uiState),
  };
}

export function readStoredWizardState() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return {
      stepIndex: Number.isInteger(parsed?.stepIndex) ? parsed.stepIndex : 0,
      draft: createInstallPlanDraft(parsed?.draft),
      uiState: extractUiTransientState(parsed?.uiState),
    };
  } catch {
    return null;
  }
}

export function writeStoredWizardState({ stepIndex, draft, uiState }) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(
    WIZARD_STORAGE_KEY,
    JSON.stringify({
      stepIndex,
      draft: createInstallPlanDraft(draft),
      uiState: extractUiTransientState(uiState),
    }),
  );
}
