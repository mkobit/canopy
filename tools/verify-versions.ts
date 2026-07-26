import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const miseTomlPath = path.join(__dirname, '../mise.toml');

// eslint-disable-next-line no-console
console.log('Verifying version consistency...');

type PackageJson = Readonly<{
  engines?: Readonly<{ bun?: string }>;
  devDependencies?: Readonly<Record<string, string>>;
}>;

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;

// Read mise.toml
const miseToml = fs.readFileSync(miseTomlPath, 'utf8');

const cleanVersion = (version: string): string => version.replace(/^[\^~]/, '');

// Verify Bun
const packageBunVersion = packageJson.engines?.bun;
const miseBunMatch = miseToml.match(/^bun\s*=\s*["']?([^"'\n]+)["']?/m);

if (!packageBunVersion) {
  console.error('Error: "engines.bun" not found in package.json');
  process.exit(1);
}

if (!miseBunMatch) {
  console.error('Error: "bun" version not found in mise.toml');
  process.exit(1);
}

const miseBunVersion = miseBunMatch[1];
if (cleanVersion(packageBunVersion) !== cleanVersion(miseBunVersion)) {
  console.error('Version Mismatch for Bun!');
  console.error(`package.json engines.bun: ${packageBunVersion}`);
  console.error(`mise.toml tools.bun:      ${miseBunVersion}`);
  process.exit(1);
}

// Verify OpenSpec
const packageOpenSpecVersion = packageJson.devDependencies?.['@fission-ai/openspec'];
const miseOpenSpecMatch = miseToml.match(
  /["']?(?:npm:)?@fission-ai\/openspec["']?\s*=\s*["']?([^"'\n]+)["']?/,
);

if (!packageOpenSpecVersion) {
  console.error('Error: "@fission-ai/openspec" not found in package.json devDependencies');
  process.exit(1);
}

if (!miseOpenSpecMatch) {
  console.error('Error: "@fission-ai/openspec" version not found in mise.toml');
  process.exit(1);
}

const miseOpenSpecVersion = miseOpenSpecMatch[1];
if (cleanVersion(packageOpenSpecVersion) !== cleanVersion(miseOpenSpecVersion)) {
  console.error('Version Mismatch for OpenSpec!');
  console.error(`package.json devDependencies.@fission-ai/openspec: ${packageOpenSpecVersion}`);
  console.error(`mise.toml tools.@fission-ai/openspec:              ${miseOpenSpecVersion}`);
  process.exit(1);
}

// Verify Beads
const miseBeadsMatch = miseToml.match(
  /["']?(?:github:gastownhall\/)?beads["']?\s*=\s*["']?([^"'\n]+)["']?/,
);

if (!miseBeadsMatch) {
  console.error('Error: "beads" version not found in mise.toml');
  process.exit(1);
}

const miseBeadsVersion = miseBeadsMatch[1];

// eslint-disable-next-line no-console
console.log(
  `✅ Versions match: Bun ${packageBunVersion}, OpenSpec ${cleanVersion(packageOpenSpecVersion)}, Beads ${miseBeadsVersion}`,
);
