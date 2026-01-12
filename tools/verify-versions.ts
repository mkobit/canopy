import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(
__dirname,
'../package.json',
);
const miseTomlPath = path.join(
__dirname,
'../mise.toml',
);

// eslint-disable-next-line no-console
console.log('Verifying version consistency...');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(
packageJsonPath,
'utf8',
));
const packageNodeVersion = packageJson.engines?.node;

if (!packageNodeVersion) {
  console.error('Error: "engines.node" not found in package.json');
  process.exit(1);
}

// Read mise.toml
// Simple parsing for now, assuming [tools] section and node = "version" format
const miseToml = fs.readFileSync(
miseTomlPath,
'utf8',
);
const miseNodeMatch = miseToml.match(/node\s*=\s*["']?([^"']+)["']?/);

if (!miseNodeMatch) {
  console.error('Error: "node" version not found in mise.toml');
  process.exit(1);
}

const miseNodeVersion = miseNodeMatch[1];

// Compare
// Allow simple equality (e.g. "22" == "22")
// If we needed semantic version comparison we'd use semver, but exact string match is safer for strict sync.
if (packageNodeVersion !== miseNodeVersion) {
  console.error(`Version Mismatch!`);
  console.error(`package.json engines.node: ${packageNodeVersion}`);
  console.error(`mise.toml tools.node:      ${miseNodeVersion}`);
  console.error(`These versions must be kept in sync.`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`✅ Versions match: Node ${packageNodeVersion}`);
