import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'manifest.json');
const outputDir = path.join(root, 'dist');

const runtimeFiles = [
  'manifest.json',
  'popup.html',
  'offscreen.html',
];
const runtimeDirs = [
  'src',
  'assets',
  'vendor',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
assert(manifest.manifest_version === 3, 'Release package requires Manifest V3.');
assert(typeof manifest.version === 'string' && /^\\d+(?:\\.\\d+){0,3}$/.test(manifest.version), `Invalid Chrome extension version: ${manifest.version}`);
assert(manifest.version_name, 'manifest.version_name is required for a beta release.');
assert(manifest.icons?.['48'], 'manifest.icons[48] is required before packaging.');
assert(manifest.icons?.['128'], 'manifest.icons[128] is required before packaging.');

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

async function copyRelative(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(outputDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });
}

for (const file of runtimeFiles) await copyRelative(file);
for (const dir of runtimeDirs) await copyRelative(dir);

const archiveName = `crab-watch-v${manifest.version}.zip`;
const archivePath = path.join(root, archiveName);
await fs.rm(archivePath, { force: true });

if (process.platform === 'win32') {
  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Compress-Archive -Path '${outputDir}\\*' -DestinationPath '${archivePath}' -Force`,
  ]);
} else {
  await execFileAsync('zip', ['-qr', archivePath, '.'], { cwd: outputDir });
}

const stat = await fs.stat(archivePath);
console.log(`Packaged Crab Watch ${manifest.version_name}`);
console.log(`ZIP: ${archivePath}`);
console.log(`Size: ${stat.size} bytes`);
