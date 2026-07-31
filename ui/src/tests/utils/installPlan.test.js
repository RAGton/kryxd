import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstallPlanPayload,
  buildInstallSecretsPayload,
  validateInstallPlanPayload,
  validateStep,
  isStrongPassword
} from '../../utils/installPlan.js';

describe('installPlan', () => {
  describe('isStrongPassword', () => {
    it('requires at least 12 characters', () => {
      assert.equal(isStrongPassword('Abc!1234567'), false);
      assert.equal(isStrongPassword('Abc!12345678'), true);
    });

    it('requires at least 3 character classes', () => {
      assert.equal(isStrongPassword('abcdefghijklmno'), false); // only lowercase
      assert.equal(isStrongPassword('ABCDEFGHIJKLMNO'), false); // only uppercase
      assert.equal(isStrongPassword('123456789012345'), false); // only numbers
      assert.equal(isStrongPassword('Abcdefghijklmno'), false); // lowercase + uppercase (2 classes)
      assert.equal(isStrongPassword('Abcdefghijklmn1'), true); // lowercase + uppercase + numbers (3 classes)
      assert.equal(isStrongPassword('Abcdefghijklm!1'), true); // lowercase + uppercase + special + numbers (4 classes)
    });
  });

  describe('buildInstallPlanPayload', () => {
    it('builds a default valid InstallPlanV2', () => {
      const draft = {
        sourceKind: 'offline-defaults',
        profileId: 'desktop',
        storageMode: 'automatic',
        sysDisk: '/dev/sda',
        mgmtInterface: 'eth0',
        mgmtMode: 'dhcp',
        wanInterface: '', // disabled
        country: 'BR',
        timeZone: 'America/Cuiaba',
        systemLocale: 'pt_BR.UTF-8',
        consoleKeymap: 'br-abnt2',
        adminUser: 'rocha',
        adminEmail: 'rocha@example.com',
        adminFullName: 'Rocha Silva',
        hostName: 'kryonix-box'
      };

      const payload = buildInstallPlanPayload(draft);

      assert.equal(payload.version, 2);
      assert.deepEqual(Object.keys(payload).sort(), ['features', 'isThinkServer', 'network', 'repository', 'storage', 'version']);
      assert.equal(payload.repository.branch, 'main');
      assert.deepEqual(payload.storage.systemDisks, ['/dev/sda']);
      assert.equal(payload.storage.topology, 'single');
      // KCR Etapa 3: mgmtInterface='eth0' + hostName='kryonix-box' emite bloco network válido
      assert.equal(payload.network.management.interface, 'eth0');
      assert.equal(payload.network.management.mode, 'dhcp');
      assert.equal(payload.network.management.hostname, 'kryonix-box');
      assert.equal(payload.network.management.prefixLength, 24);
      assert.equal(payload.network.wan, null);
      assert.equal(payload.locale, undefined);
      assert.equal(payload.admin, undefined);
    });
    
    it('activates srvData appropriately', () => {
      const draft = {
        sourceKind: 'offline-defaults',
        profileId: 'desktop',
        storageMode: 'automatic',
        sysDisk: '/dev/sda',
        mgmtInterface: 'eth0',
        mgmtMode: 'dhcp',
        selectedFeatures: ['storage.srv-data', 'ai.ollama']
      };

      const payload = buildInstallPlanPayload(draft);
      assert.equal(payload.features.storage['srv-data'], true);
      assert.deepEqual(payload.storage.data, null);
    });

    // ── KCR-2026-07-31-01 Etapa 3: tests do payload network ────────────────

    it('KCR #8: includes network block when mgmtInterface is set', () => {
      const draft = {
        sourceKind: 'offline-defaults',
        profileId: 'desktop',
        sysDisk: '/dev/sda',
        mgmtInterface: 'enp1s0',
        mgmtMode: 'static',
        serverIp: '192.168.1.10',
        mgmtGateway: '192.168.1.1',
        mgmtDns: '1.1.1.1,8.8.8.8',
        hostName: 'kryonix-edge-01',
        wanInterface: '',
      };

      const payload = buildInstallPlanPayload(draft);
      assert.ok(payload.network, 'network block must be present');
      assert.equal(payload.network.management.interface, 'enp1s0');
      assert.equal(payload.network.management.mode, 'static');
      assert.equal(payload.network.management.address, '192.168.1.10');
      assert.equal(payload.network.management.gateway, '192.168.1.1');
      assert.deepEqual(payload.network.management.dns, ['1.1.1.1', '8.8.8.8']);
      assert.equal(payload.network.management.prefixLength, 24);
      assert.equal(payload.network.management.hostname, 'kryonix-edge-01');
      assert.equal(payload.network.wan, null);
      // Senha PPPoE NÃO pode aparecer no payload — fica nos secrets
      assert.equal(payload.network.management.pppoePassword, undefined);
    });

    it('KCR #9: excludes network block when mgmtInterface is empty (offline)', () => {
      const draft = {
        sourceKind: 'offline-defaults',
        profileId: 'desktop',
        sysDisk: '/dev/sda',
        mgmtInterface: '',
        mgmtMode: 'dhcp',
        hostName: 'kryonix-offline',
      };

      const payload = buildInstallPlanPayload(draft);
      // Edge offline puro → network: null (não emitir bloco é ok, mas null é mais explícito)
      assert.equal(payload.network, null);
    });

    it('KCR #10: includes wan.pppoeUser (never pppoePassword in payload)', () => {
      const draft = {
        sourceKind: 'offline-defaults',
        profileId: 'desktop',
        sysDisk: '/dev/sda',
        mgmtInterface: 'enp1s0',
        mgmtMode: 'dhcp',
        hostName: 'kryonix-pppoe-node',
        wanInterface: 'enp2s0',
        wanMode: 'pppoe',
        pppoeUser: 'cliente@provedor.net',
        pppoePassword: 'segredo-que-nao-deve-vazar',
      };

      const payload = buildInstallPlanPayload(draft);
      assert.ok(payload.network);
      assert.equal(payload.network.management.interface, 'enp1s0');
      assert.ok(payload.network.wan, 'wan block must be present in pppoe mode');
      assert.equal(payload.network.wan.interface, 'enp2s0');
      assert.equal(payload.network.wan.mode, 'pppoe');
      assert.equal(payload.network.wan.pppoeUser, 'cliente@provedor.net');
      // CRÍTICO: senha NUNCA vai no payload. Vai via /api/v2/secrets.
      assert.equal(payload.network.wan.pppoePassword, undefined);
      assert.equal(payload.pppoePassword, undefined);
      assert.equal(payload.network.management.pppoePassword, undefined);
      // varredura: nenhuma chave do payload contém o valor da senha
      const payloadStr = JSON.stringify(payload);
      assert.equal(payloadStr.includes('segredo-que-nao-deve-vazar'), false,
        'PPPoE password leaked into payload');
    });
  });

  describe('validateStep', () => {
    it('validates eula step', () => {
      const resultNoEula = validateStep('eula', {}, { eulaAccepted: false });
      assert.equal(resultNoEula.blockingIssues.length > 0, true);
      assert.match(resultNoEula.blockingIssues[0], /aceitar os termos/i);

      const resultWithEula = validateStep('eula', {}, { eulaAccepted: true });
      assert.equal(resultWithEula.blockingIssues.length, 0);
    });

    it('validates network step', () => {
      const resultNoNet = validateStep('network', {}, { netConnected: false, netOffline: false });
      assert.equal(resultNoNet.blockingIssues.length > 0, true);
      assert.match(resultNoNet.blockingIssues[0], /internet/i);

      const resultWithNet = validateStep('network', { mgmtInterface: 'eth0' }, { netConnected: true });
      assert.equal(resultWithNet.fieldErrors.mgmtInterface, undefined);
    });

    it('validates users step with weak password', () => {
      const draft = {
        adminUser: 'rocha',
        adminFullName: 'Rocha',
        adminEmail: 'invalid-email',
      };
      draft.adminPassword = 'weak';
      draft.adminPasswordConfirm = 'weak';

      const result = validateStep('users', draft);
      assert.equal(result.fieldErrors.adminEmail, 'Informe um e-mail válido.');
      assert.equal(result.fieldErrors.adminPassword, 'Use uma senha forte com 12+ caracteres e 3 classes de caracteres.');
    });
    
    it('allows weak password if allowWeakPassword is true', () => {
      const draft = {
        adminUser: 'rocha',
        adminFullName: 'Rocha',
        adminEmail: 'rocha@ex.com',
        adminPassword: 'weak',
        adminPasswordConfirm: 'weak',
        allowWeakPassword: true
      };

      const result = validateStep('users', draft);
      assert.equal(result.fieldErrors.adminPassword, undefined);
    });
  });
});
