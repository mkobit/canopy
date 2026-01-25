import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const miseTomlPath = path.join(__dirname, '../mise.toml');

// eslint-disable-next-line no-console
console.log('Verifying version consistency...');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageBunVersion = packageJson.engines?.bun;

if (!packageBunVersion) {
  console.error('Error: "engines.bun" not found in package.json');
  process.exit(1);
}

// Read mise.toml
// Simple parsing for now, assuming [tools] section and bun = "version" format
const miseToml = fs.readFileSync(miseTomlPath, 'utf8');
const miseBunMatch = miseToml.match(/bun\s*=\s*["']?([^"']+)["']?/);

if (!miseBunMatch) {
  console.error('Error: "bun" version not found in mise.toml');
  process.exit(1);
}

const miseBunVersion = miseBunMatch[1];

// Compare
if (packageBunVersion !== miseBunVersion) {
  console.error(`Version Mismatch!`);
  console.error(`package.json engines.bun: ${packageBunVersion}`);
  console.error(`mise.toml tools.bun:      ${miseBunVersion}`);
  console.error(`These versions must be kept in sync.`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`✅ Versions match: Bun ${packageBunVersion}`);
