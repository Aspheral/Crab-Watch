import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'node_modules', 'stockfish', 'bin');
const targetDir = path.join(root, 'vendor', 'stockfish');
const files = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

await fs.mkdir(targetDir, { recursive: true });
for (const file of files) {
  await fs.copyFile(path.join(sourceDir, file), path.join(targetDir, file));
  console.log(`Vendored ${file}`);
}

console.log('Stockfish 18 lite single-threaded is ready for Crab Watch.');
