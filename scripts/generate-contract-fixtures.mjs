import { mkdir, writeFile } from 'node:fs/promises';
import { buildInstallPlanV2 } from '../ui/src/utils/installPlan.js';

const wizardFixture = {
  sourceKind: 'offline-defaults',
  profileId: 'desktop',
  storageMode: 'automatic',
  diskProfile: 'single',
  sysDisk: '/dev/sda',
  mgmtInterface: 'eth0',
  mgmtMode: 'dhcp',
  wanInterface: '',
  country: 'BR',
  timeZone: 'America/Cuiaba',
  systemLocale: 'pt_BR.UTF-8',
  consoleKeymap: 'br-abnt2',
  adminUser: 'rocha',
  adminEmail: 'rocha@example.com',
  adminFullName: 'Rocha Silva',
  hostName: 'kryonix-box',
  selectedFeatures: ['storage.srv-data', 'ai.ollama'],
};

const plan = buildInstallPlanV2(wizardFixture);
if (plan.version !== 2) {
  throw new Error(`InstallPlanV2 inválido: version=${plan.version}`);
}

const outputPath = new URL('../tests/contracts/install-plan-v2-ui.json', import.meta.url);
await mkdir(new URL('../tests/contracts/', import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(`GENERATED: ${outputPath.pathname}`);
