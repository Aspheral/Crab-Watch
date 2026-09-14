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
assert(typeof manifest.version === 'string' && /^\d+(?:\.\d+){0,3}$/.test(manifest.version), `Invalid Chrome extension version: ${manifest.version}`);
assert(manifest.version_name, 'manifest.version_name is required for a beta release.');

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

const iconSource = path.join(root, 'assets', 'crab.svg');
const iconOutputDir = path.join(outputDir, 'assets', 'icons');
await fs.mkdir(iconOutputDir, { recursive: true });

async function rasterizeIcons() {
  const candidates = process.platform === 'win32'
    ? ['magick', 'convert']
    : ['magick', 'convert'];

  let command = null;
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['-version']);
      command = candidate;
      break;
    } catch {}
  }

  assert(command, 'ImageMagick is required to rasterize assets/crab.svg into Web Store PNG icons. Install ImageMagick and rerun npm run package:extension.');

  for (const size of [16, 32, 48, 128]) {
    const target = path.join(iconOutputDir, `icon${size}.png`);
    await execFileAsync(command, [
      iconSource,
      '-background', 'none',
      '-resize', `${size}x${size}`,
      target,
    ]);
  }
}

await rasterizeIcons();

const packagedManifest = {
  ...manifest,
  icons: {
    ...(manifest.icons || {}),
    '16': 'assets/icons/icon16.png',
    '32': 'assets/icons/icon32.png',
    '48': 'assets/icons/icon48.png',
    '128': 'assets/icons/icon128.png',
  },
  action: {
    ...(manifest.action || {}),
    default_icon: {
      '16': 'assets/icons/icon16.png',
      '32': 'assets/icons/icon32.png',
    },
  },
};

await fs.writeFile(
  path.join(outputDir, 'manifest.json'),
  `${JSON.stringify(packagedManifest, null, 2)}\n`,
  'utf8',
);

for (const size of [16, 32, 48, 128]) {
  const iconPath = path.join(iconOutputDir, `icon${size}.png`);
  const stat = await fs.stat(iconPath);
  assert(stat.size > 100, `Generated icon${size}.png is unexpectedly small.`);
}

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
console.log('Icons: assets/crab.svg -> PNG 16/32/48/128');
