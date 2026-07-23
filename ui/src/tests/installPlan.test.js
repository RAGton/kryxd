import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstallPlanPayload,
  buildInstallSecretsPayload,
  validateStep,
  validateInstallPlanPayload,
} from '../utils/installPlan.js';
import {
  INITIAL_INSTALL_PLAN_DRAFT,
  INITIAL_UI_TRANSIENT_STATE,
  createInstallPlanDraft,
  extractUiTransientState,
} from '../state/wizardState.js';

function createValidDraft(overrides = {}) {
  return createInstallPlanDraft({
    ...INITIAL_INSTALL_PLAN_DRAFT,
    mgmtInterface: 'enp1s0',
    wanInterface: 'enp2s0',
    hostName: 'srv-rag',
    serverIp: '10.0.0.10',
    mgmtGateway: '10.0.0.1',
    mgmtDns: '1.1.1.1,8.8.8.8',
    sysDisk: '/dev/sda',
    selectedDisks: ['/dev/sda'],
    adminEmail: 'admin@example.com',
    adminPassword: 'SenhaForte@2026',
    adminPasswordConfirm: 'SenhaForte@2026',
    ...overrides,
  });
}

function createValidUi(overrides = {}) {
  return extractUiTransientState({
    ...INITIAL_UI_TRANSIENT_STATE,
    eulaAccepted: true,
    destructiveConfirmed: true,
    netIfacesCount: 2,
    netConnected: true,
    wanIdentified: true,
    lanIdentified: true,
    ...overrides,
  });
}

test('etapa de rede bloqueia avanço sem conexao ou modo offline', () => {
  const draft = createValidDraft();
  const uiState = createValidUi({
    netConnected: false,
    netOffline: false,
  });

  const validation = validateStep('network', draft, uiState);
  assert.ok(validation.blockingIssues.includes('Conecte-se à internet ou selecione "Continuar offline" para prosseguir.'));

  const validOnline = validateStep('network', draft, { ...uiState, netConnected: true });
  assert.equal(validOnline.blockingIssues.includes('Conecte-se à internet ou selecione "Continuar offline" para prosseguir.'), false);

  const validOffline = validateStep('network', draft, { ...uiState, netOffline: true });
  assert.equal(validOffline.blockingIssues.includes('Conecte-se à internet ou selecione "Continuar offline" para prosseguir.'), false);
});

test('draft gera InstallPlanV2 canonico sem vazar estado transitorio', () => {
  const draft = createValidDraft({
    wanMode: 'static',
    wanAddress: '203.0.113.10',
    wanNetmask: '255.255.255.0',
    wanGateway: '203.0.113.1',
    wanDns: '1.1.1.1,8.8.8.8',
    timeZone: 'America/Cuiaba',
  });

  const plan = buildInstallPlanPayload({
    ...draft,
    destructiveConfirmed: true,
    wanIdentified: false,
  });

  assert.equal(plan.version, 2);
  assert.equal(plan.isThinkServer, false);
  assert.deepEqual(Object.keys(plan).sort(), ['features', 'isThinkServer', 'repository', 'storage', 'version']);
  assert.equal(plan.repository.downstreamUrl, 'https://github.com/RAGton/kryonixos');
  assert.equal(plan.storage.topology, 'single');
  assert.deepEqual(plan.storage.systemDisks, ['/dev/sda']);
  assert.equal(plan.storage.root.filesystem, 'btrfs');
  assert.deepEqual(plan.features.system, {});
  assert.equal(plan.network, undefined);
  assert.equal(plan.locale, undefined);
  assert.equal(plan.admin, undefined);
  assert.equal(plan.destructiveConfirmed, undefined);
});

test('timezone da etapa final precisa ser IANA canonico', () => {
  const invalidValidation = validateStep('timezone', createValidDraft({
    timeZone: '15.2,-56.1',
  }), createValidUi());

  assert.equal(invalidValidation.fieldErrors.timeZone, 'Selecione um timezone IANA canônico.');

  const validValidation = validateStep('timezone', createValidDraft({
    timeZone: 'America/Cuiaba',
  }), createValidUi());

  assert.equal(validValidation.fieldErrors.timeZone, undefined);
});

test('draft gera install-secrets canonico', () => {
  const draft = createValidDraft({
    wanMode: 'pppoe',
    pppoePassword: 'SegredoPPP@2026',
  });

  const secrets = buildInstallSecretsPayload(draft);

  assert.deepEqual(secrets, {
    adminPassword: 'SenhaForte@2026',
    adminPasswordConfirm: 'SenhaForte@2026',
    wanPppoePassword: 'SegredoPPP@2026',
  });
});

test('WAN DHCP nao exige credenciais PPPoE', () => {
  const draft = createValidDraft({
    wanMode: 'dhcp',
    pppoeUser: '',
    pppoePassword: '',
  });

  const validation = validateStep('network', draft, createValidUi());

  assert.equal(validation.fieldErrors.pppoeUser, undefined);
  assert.equal(validation.fieldErrors.pppoePassword, undefined);
  assert.equal(validation.blockingIssues.length, 0);
});

test('WAN pode ficar vazia sem bloquear a etapa de rede', () => {
  const draft = createValidDraft({
    wanInterface: '',
    wanMode: 'dhcp',
  });

  const validation = validateStep('network', draft, createValidUi());

  assert.equal(validation.fieldErrors.wanInterface, undefined);
  assert.equal(validation.blockingIssues.length, 0);
});

test('WAN PPPoE exige usuario e senha', () => {
  const draft = createValidDraft({
    wanMode: 'pppoe',
    pppoeUser: '',
    pppoePassword: '',
  });

  const validation = validateStep('network', draft, createValidUi());

  assert.equal(validation.fieldErrors.pppoeUser, 'PPPoE: informe o usuário.');
  assert.equal(validation.fieldErrors.pppoePassword, 'PPPoE: informe a senha.');
});

test('validacao por etapa respeita campos UX sem poluir o payload', () => {
  const draft = createValidDraft();
  const uiState = createValidUi({
    wanIdentified: false,
    lanIdentified: false,
    destructiveConfirmed: false,
  });

  const networkValidation = validateStep('network', draft, uiState);
  const summaryValidation = validateStep('summary', draft, uiState);

  assert.ok(networkValidation.warnings.includes('A porta WAN ainda não foi confirmada fisicamente.'));
  assert.ok(networkValidation.warnings.includes('A porta LAN ainda não foi confirmada fisicamente.'));
  assert.ok(summaryValidation.blockingIssues.includes('Confirme o aviso destrutivo para continuar.'));
});

test('single e split geram storage coerente e RAID é bloqueado no InstallPlanV2', () => {
  const singlePlan = buildInstallPlanPayload(createValidDraft({
    selectedDisks: ['/dev/sda'],
    diskMode: 'one',
    diskProfile: 'single',
    sysDisk: '/dev/sda',
    rootFs: 'xfs',
  }));

  assert.equal(singlePlan.storage.topology, 'single');
  assert.deepEqual(singlePlan.storage.systemDisks, ['/dev/sda']);
  assert.deepEqual(singlePlan.storage.dataDisks, []);
  assert.equal(singlePlan.storage.root.filesystem, 'xfs');
  assert.equal(singlePlan.storage.data, null);

  const splitPlan = buildInstallPlanPayload(createValidDraft({
    diskMode: 'two',
    diskProfile: 'single',
    sysDisk: '/dev/sda',
    dataDisk: '/dev/sdb',
    selectedDisks: ['/dev/sda', '/dev/sdb'],
    rootFs: 'xfs',
    dataFs: 'ext4',
  }));

  assert.equal(splitPlan.storage.topology, 'split');
  assert.deepEqual(splitPlan.storage.systemDisks, ['/dev/sda']);
  assert.deepEqual(splitPlan.storage.dataDisks, ['/dev/sdb']);
  assert.equal(splitPlan.storage.root.filesystem, 'xfs');
  assert.equal(splitPlan.storage.data.filesystem, 'ext4');

  assert.throws(() => buildInstallPlanPayload(createValidDraft({
    storageMode: 'raid',
    selectedDisks: ['/dev/sda', '/dev/sdb'],
    sysDisk: '/dev/sda',
    raidLevel: 'raid1',
  })), /unsupported/i);
});

test('single, split e raid10 invalidos geram erros especificos', () => {
  const singleValidation = validateStep('disks', createValidDraft({
    diskProfile: 'single',
    diskMode: 'one',
    selectedDisks: [],
    sysDisk: '',
  }), createValidUi());

  assert.equal(singleValidation.fieldErrors.selectedDisks, 'Selecione pelo menos 1 disco físico.');
  assert.equal(singleValidation.fieldErrors.sysDisk, 'Escolha o disco do sistema.');

  const splitValidation = validateStep('disks', createValidDraft({
    diskProfile: 'single',
    diskMode: 'two',
    selectedDisks: ['/dev/sda'],
    sysDisk: '/dev/sda',
    dataDisk: '',
  }), createValidUi());

  assert.equal(splitValidation.fieldErrors.selectedDisks, 'O layout split exige exatamente 2 discos distintos.');

  const raid10Validation = validateStep('disks', createValidDraft({
    diskProfile: 'raid',
    diskMode: 'one',
    selectedDisks: ['/dev/sda', '/dev/sdb', '/dev/sdc', '/dev/sdd', '/dev/sde'],
    sysDisk: '/dev/sda',
    raidPlan: { level: 'raid10', devices: ['/dev/sda', '/dev/sdb', '/dev/sdc', '/dev/sdd', '/dev/sde'], filesystem: 'btrfs', mountpoint: '/' },
  }), createValidUi());

  assert.equal(raid10Validation.fieldErrors.selectedDisks, 'RAID 10 exige quantidade par de discos.');
});

test('storage blocking issues vindos da UI bloqueiam summary e install', () => {
  const draft = createValidDraft();
  const uiState = createValidUi({
    storageBlockingIssues: ['Os discos selecionados nao sao suficientemente homogeneos para RAID 5.'],
    storageWarnings: ['Capacidade acima do menor disco sera desperdicada.'],
  });

  const summaryValidation = validateStep('summary', draft, uiState);

  assert.ok(summaryValidation.blockingIssues.includes('Os discos selecionados nao sao suficientemente homogeneos para RAID 5.'));
  assert.ok(summaryValidation.warnings.includes('Capacidade acima do menor disco sera desperdicada.'));
});


test('buildInstallPlanPayload não vaza campos extras em repository', () => {
  const draft = createValidDraft();
  const plan = buildInstallPlanPayload(draft);

  assert.deepEqual(Object.keys(plan.repository).sort(), ['branch', 'coreUrl', 'downstreamUrl', 'upstreamUrl']);
  assert.equal(plan.repository.coreUrl, 'https://github.com/RAGton/kryonix');
  assert.equal(plan.repository.downstreamUrl, 'https://github.com/RAGton/kryonixos');
  assert.equal(plan.source, undefined);
});

test('schema validation passa para InstallPlanV2 single', () => {
  const plan = buildInstallPlanPayload(createValidDraft({
    mgmtMode: 'dhcp',
    mgmtGateway: '',
    wanInterface: '',
  }));

  assert.doesNotThrow(() => validateInstallPlanPayload(plan));
});

test('schema validation passa para InstallPlanV2 split', () => {
  const plan = buildInstallPlanPayload(createValidDraft({
    diskMode: 'two',
    sysDisk: '/dev/sda',
    dataDisk: '/dev/sdb',
    selectedDisks: ['/dev/sda', '/dev/sdb'],
    rootFs: 'btrfs',
    dataFs: 'ext4',
  }));

  assert.doesNotThrow(() => validateInstallPlanPayload(plan));
});

test('validacao serverIp aceita 0.0.0.0 no formato (schema exige IPv4 valido)', () => {
  // isValidIpv4 so verifica formato IPv4; 0.0.0.0 passa no regex.
  // A rejeicao de IPs sentinela (0.0.0.0, 127.*, 169.254.*) ocorre no RemoteAccess.jsx via isValidIp.
  const draft = createValidDraft({
    mgmtMode: 'static',
    serverIp: '0.0.0.0',
    mgmtGateway: '10.0.0.1',
    mgmtNetmask: '255.255.255.0',
    mgmtDns: '1.1.1.1,8.8.8.8',
    wanInterface: '',
  });

  const validation = validateStep('network', draft, createValidUi());

  // No nivel do schema/installPlan, 0.0.0.0 e um IPv4 valido
  assert.equal(validation.fieldErrors.serverIp, undefined);
});

test('validacao serverIp aceita 127.* no formato (schema so valida IPv4)', () => {
  const draft = createValidDraft({
    mgmtMode: 'static',
    serverIp: '127.0.0.1',
    mgmtGateway: '10.0.0.1',
    mgmtNetmask: '255.255.255.0',
    mgmtDns: '1.1.1.1,8.8.8.8',
    wanInterface: '',
  });

  const validation = validateStep('network', draft, createValidUi());

  assert.equal(validation.fieldErrors.serverIp, undefined);
});

test('validacao serverIp aceita 169.254.* no formato (schema so valida IPv4)', () => {
  const draft = createValidDraft({
    mgmtMode: 'static',
    serverIp: '169.254.1.1',
    mgmtGateway: '10.0.0.1',
    mgmtNetmask: '255.255.255.0',
    mgmtDns: '1.1.1.1,8.8.8.8',
    wanInterface: '',
  });

  const validation = validateStep('network', draft, createValidUi());

  assert.equal(validation.fieldErrors.serverIp, undefined);
});

test('serverIp valido no modo static: IP publico ou privado e aceito pelo regex', () => {
  const draft = createValidDraft({
    mgmtMode: 'static',
    serverIp: '10.0.0.10',
    mgmtGateway: '10.0.0.1',
    mgmtNetmask: '255.255.255.0',
    mgmtDns: '1.1.1.1,8.8.8.8',
    wanInterface: '',
  });

  const validation = validateStep('network', draft, createValidUi());

  assert.equal(validation.fieldErrors.serverIp, undefined);
});

test('contract: buildInstallPlanV2 preserva features e exclui rede, identidade e secrets', () => {
  const draft = createValidDraft({
    selectedFeatures: ['storage.srv-data', 'ai.ollama', 'remote.openssh'],
    adminAuthorizedKeys: '[REDACTED]',
    targetRemoteAccessEnabled: true,
    adminPassword: '[REDACTED]',
    adminPasswordConfirm: '[REDACTED]',
    adminEmail: 'admin@example.invalid',
    adminUid: 1000,
  });

  const plan = buildInstallPlanPayload(draft);

  assert.deepEqual(Object.keys(plan).sort(), ['features', 'isThinkServer', 'repository', 'storage', 'version']);
  assert.equal(plan.features.storage['srv-data'], true);
  assert.equal(plan.features.ai.ollama, true);
  assert.equal(plan.features.remote.openssh, true);
  assert.equal(plan.network, undefined);
  assert.equal(plan.locale, undefined);
  assert.equal(plan.admin, undefined);
  assert.equal(plan.targetRemoteAccess, undefined);
  assert.equal(plan.adminPassword, undefined);
});

test('contract: buildInstallSecretsPayload isola senhas corretamente', () => {
  const draft = createValidDraft({
    adminPassword: 'SuperSecretPassword123!',
    adminPasswordConfirm: 'SuperSecretPassword123!',
    pppoePassword: 'PppoeSecret!',
    wanMode: 'pppoe',
  });

  const secrets = buildInstallSecretsPayload(draft);

  assert.equal(secrets.adminPassword, 'SuperSecretPassword123!');
  assert.equal(secrets.adminPasswordConfirm, 'SuperSecretPassword123!');
  assert.equal(secrets.wanPppoePassword, 'PppoeSecret!');
});
