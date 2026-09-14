import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));

const requiredFiles = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'offscreen.html',
  'src/content.js',
  'src/background.js',
  'src/offscreen.js',
  'assets/crab.svg',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.manifest_version === 3, 'Manifest V3 is required.');
assert(/^\\d+(?:\\.\\d+){0,3}$/.test(manifest.version), `Invalid manifest version: ${manifest.version}`);
assert(manifest.version_name === '0.11.0 Beta', 'Release validator expects 0.11.0 Beta.');
assert(manifest.permissions?.includes('storage'), 'storage permission missing.');
assert(manifest.permissions?.includes('offscreen'), 'offscreen permission missing.');
assert(manifest.host_permissions?.includes('https://www.chess.com/*'), 'Chess.com host permission missing.');
assert(manifest.host_permissions?.includes('https://api.chess.com/*'), 'Chess.com API host permission missing.');

for (const relativePath of requiredFiles) {
  try {
    await fs.access(path.join(root, relativePath));
  } catch {
    throw new Error(`Required runtime file missing: ${relativePath}`);
  }
}

assert(manifest.icons?.['48'], 'Final 48x48 icon is not wired into the manifest yet.');
assert(manifest.icons?.['128'], 'Final 128x128 icon is not wired into the manifest yet.');

console.log(`Release manifest ${manifest.version_name} passed structural validation.`);
