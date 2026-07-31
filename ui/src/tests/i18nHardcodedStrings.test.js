import { test } from 'node:test';
import * as assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Files to check
const srcDir = path.resolve(import.meta.dirname, '..');

// Regex to find JSX text nodes: >Texto<
// Excludes things that start with lower case letters if we want? Actually, it's better to exclude spaces or empty strings.
// Let's capture text between > and < that is not just whitespace.
// A more robust regex:
const jsxTextRegex = />([^<{}]+)</g;

// Exclusions for strings that are technically hardcoded but allowed (e.g. acronyms, technical terms)
const allowlist = [
  'EFI', 'Root', 'Home', 'Swap', 'BTRFS', 'EXT4', 'FAT32 (EFI)', 'XFS', 'SWAP',
  'TYPE: ', 'READ-ONLY', 'REMOVABLE', 'N/A', 'X', 'O',
  'KRYONIX', 'Installer', 'Mock Mode', 'Over-Allocation', 'ROOT BTRFS (~100%)',
  '~100%', '512 MiB', 'vfat (FAT32)', '/boot/efi', '/srv', 'Kryonix OS Deployer',
  'DHCP', 'PPPoE', '255.255.255.0 (/24)', '255.255.255.128 (/25)', '255.255.255.252 (/30)',
  '255.255.0.0 (/16)', '✈️', '⚠️', '= 8 ?', 'pode ser destrutiva',
  'Tipo', 'IPv4', 'Ações', 'Storage Pools', 'Kryonix Think Server', 'Think Server', 'Configuração otimizada para servidores (Headless, ZFS)',
  'Plasma 6', 'AI Ready', 'High-FPS', 'Hypervisor'
];

// Helper to get all files
function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (file !== 'tests' && file !== 'locales' && file !== 'node_modules' && file !== 'dist' && file !== 'kcp' && file !== 'views') {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      }
    } else {
      if (file.endsWith('.jsx')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

test('i18n Hardcoded Strings Sweep', () => {
  const files = getAllFiles(srcDir);
  const hardcodedFound = [];

  for (const file of files) {
    if (file.includes('/layouts/') || file.includes('/components/') || file.includes('/views/') || file.includes('/kcp/') || file.endsWith('App.jsx') || file.endsWith('Login.jsx')) {
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    
    // We only care about text inside JSX elements.
    let match;
    while ((match = jsxTextRegex.exec(content)) !== null) {
      let text = match[1].trim();
      
      // Skip empty strings, single characters (like '-', '|', '/'), or purely numeric/variable-like structures
      if (text.length <= 1) continue;
      if (/^[0-9\.\-\:\/]+$/.test(text)) continue; 
      
      // Skip JS expressions that got caught
      if (text.includes('&&') || text.includes('===') || text.includes('!==') || text.includes('? (') || text.includes(') : (')) continue;
      if (text.match(/^[a-zA-Z_]+\s*===?/)) continue;
      if (text.match(/return\s*\(/)) continue;
      if (text.match(/\.map\s*\(/)) continue;
      if (text.match(/\.filter\s*\(/)) continue;
      if (text.match(/\.replace\s*\(/)) continue;
      if (text.match(/^[a-zA-Z0-9_]+\s*=\s*/)) continue;
      if (text.startsWith('0 ?') || text.startsWith('0 &&')) continue;
      if (text.includes(';') || text.includes('case ') || text.includes('return ') || text.includes('=>')) continue;

      // Check allowlist
      let isAllowed = false;
      for (const allowed of allowlist) {
        if (text === allowed || text.includes(allowed)) {
          isAllowed = true;
          break;
        }
      }
      
      if (!isAllowed) {
        hardcodedFound.push({
          file: path.relative(srcDir, file),
          text: text
        });
      }
    }
  }

  // Print out the findings to help developers fix them
  if (hardcodedFound.length > 0) {
    console.error('Found hardcoded strings that need i18n translation:');
    hardcodedFound.forEach(f => console.error(`  ${f.file}: "${f.text}"`));
  }

  assert.strictEqual(hardcodedFound.length, 0, `Found ${hardcodedFound.length} hardcoded strings. Please translate them using i18next t().`);
});
