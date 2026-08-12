import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// tsc only emits compiled JS; the extension also needs its manifest and
// static HTML copied into dist/ alongside it since chrome://extensions loads
// dist/ as one self-contained unpacked directory.
const STATIC_FILES = ['manifest.json', 'src/popup/popup.html'] as const;

const rootDirectory = resolve(import.meta.dirname, '..');
const distDirectory = resolve(rootDirectory, 'dist');

for (const relativePath of STATIC_FILES) {
  const sourcePath = resolve(rootDirectory, relativePath);
  const destinationPath = resolve(
    distDirectory,
    relativePath === 'manifest.json' ? 'manifest.json' : relativePath.replace(/^src\//, ''),
  );
  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath);
}
