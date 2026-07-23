#!/usr/bin/env node

import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const schemaPath = path.join(repoRoot, 'schemas', 'install-plan.schema.json');
const registryPath = path.join(repoRoot, 'schemas', 'capabilities.json');
const generatedDir = path.join(repoRoot, 'ui', 'src', 'generated');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const version = schema.properties?.version?.const;
if (version !== 2) {
  throw new Error(`InstallPlanV2 canônico deve declarar version=2; recebido ${version}`);
}
if (!Array.isArray(registry.capabilities) || registry.capabilities.length !== 42) {
  throw new Error(`registry canônico deve conter 42 capabilities; recebido ${registry.capabilities?.length}`);
}

const files = new Map([
  ['capabilities.js', `// Gerado por scripts/generate-ui-contracts.mjs — não editar manualmente.\nexport const CAPABILITY_REGISTRY = ${JSON.stringify(registry, null, 2)};\nexport const CAPABILITIES = Object.freeze(CAPABILITY_REGISTRY.capabilities);\nexport const CAPABILITY_BY_ID = Object.freeze(Object.fromEntries(CAPABILITIES.map((capability) => [capability.id, capability])));\nexport const UNSUPPORTED_CAPABILITY_IDS = Object.freeze(CAPABILITIES.filter((capability) => capability.status === 'unsupported').map((capability) => capability.id));\n`],
  ['installPlanVersion.js', `// Gerado por scripts/generate-ui-contracts.mjs — não editar manualmente.\nexport const INSTALL_PLAN_VERSION = ${version};\n`],
  ['installPlanSchema.js', `// GENERATED FILE — DO NOT EDIT.\n// Source: schemas/install-plan.schema.json\n\nconst INSTALL_PLAN_SCHEMA = Object.freeze(${JSON.stringify(schema, null, 2)});\n\nexport { INSTALL_PLAN_SCHEMA };\nexport default INSTALL_PLAN_SCHEMA;\n`],
]);

const check = process.argv.includes('--check');
const mismatches = [];
if (!check) {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(generatedDir, { recursive: true }));
}
for (const [name, content] of files) {
  const target = path.join(generatedDir, name);
  let current = null;
  try {
    current = await readFile(target, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (check) {
    if (current !== content) mismatches.push(path.relative(repoRoot, target));
  } else {
    await writeFile(target, content, 'utf8');
  }
}

if (check && mismatches.length > 0) {
  console.error(`Contratos gerados desatualizados:\n${mismatches.map((file) => `- ${file}`).join('\n')}`);
  process.exitCode = 1;
}
