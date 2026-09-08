import { readFileSync, existsSync } from 'node:fs';
import { kitSpecSchema, sbxEnvV1Schema } from './sbx-schemas';

const FORBIDDEN_KEYS = [
  'secrets',
  'bindings',
  'registries',
  'additionalWorkspaces',
  'localWorkspaces',
] as const;

const REQUIRED_PORTS = [5173, 6006] as const;
const filesToCheck = ['.sbx/.sbxenv.yaml', '.sbx/.sbxenv.agy.yaml'] as const;
const kitSpecFile = '.sbx/kit/spec.yaml';
const kitDirectory = '.sbx/kit';

function checkKitWithSbxIfAvailable(directory: string): undefined {
  const sbxPath = Bun.which('sbx');
  if (!sbxPath) {
    return undefined;
  }

  process.stdout.write(`Running host 'sbx kit validate ${directory}'...\n`);
  const result = Bun.spawnSync([sbxPath, 'kit', 'validate', directory], {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (result.exitCode !== 0 && result.exitCode !== null) {
    process.stderr.write(`Host 'sbx kit validate' failed with exit code ${result.exitCode}\n`);
    process.exit(1);
  }
  return undefined;
}

function checkKitSpec(file: string): boolean {
  if (!existsSync(file)) {
    process.stderr.write(`Missing expected kit spec file: ${file}\n`);
    return false;
  }

  const raw = readFileSync(file, 'utf8');
  const parsed = Bun.YAML.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    process.stderr.write(`File ${file} does not contain a YAML object\n`);
    return false;
  }

  const result = kitSpecSchema.safeParse(parsed);
  if (!result.success) {
    process.stderr.write(
      `Validation failed for ${file}: ${JSON.stringify(result.error.format(), null, 2)}\n`,
    );
    return false;
  }

  const schemaVersion =
    'schemaVersion' in result.data
      ? result.data.schemaVersion
      : 'schema_version' in result.data
        ? result.data.schema_version
        : 'unknown';

  process.stdout.write(
    `✓ ${file} is valid (${result.data.name}, schemaVersion: ${schemaVersion})\n`,
  );
  return true;
}

function checkFile(file: string): boolean {
  if (!existsSync(file)) {
    process.stderr.write(`Missing expected environment file: ${file}\n`);
    return false;
  }

  const raw = readFileSync(file, 'utf8');
  const parsed = Bun.YAML.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    process.stderr.write(`File ${file} does not contain a YAML object\n`);
    return false;
  }

  const record = parsed as Record<string, unknown>;
  const foundForbidden = FORBIDDEN_KEYS.filter((key) => Object.hasOwn(record, key));
  if (foundForbidden.length > 0) {
    process.stderr.write(
      `File ${file} contains forbidden tracked properties: ${foundForbidden.join(', ')}\n`,
    );
    return false;
  }

  const result = sbxEnvV1Schema.safeParse(parsed);
  if (!result.success) {
    process.stderr.write(
      `Validation failed for ${file}: ${JSON.stringify(result.error.format(), null, 2)}\n`,
    );
    return false;
  }

  if (typeof result.data.workspace === 'object' && !result.data.workspace.clone) {
    process.stderr.write(`File ${file} must have workspace.clone: true\n`);
    return false;
  }

  const kitsList = result.data.kits ?? (result.data.kit ? [result.data.kit] : []);
  if (!kitsList.includes('./kit')) {
    process.stderr.write(`File ${file} must include "./kit" in kits\n`);
    return false;
  }

  const declaredSandboxPorts = new Set((result.data.ports ?? []).map((port) => port.sandbox));
  const missingPorts = REQUIRED_PORTS.filter(
    (requiredPort) => !declaredSandboxPorts.has(requiredPort),
  );
  if (missingPorts.length > 0) {
    const errorMessages = missingPorts
      .map((missingPort) => `File ${file} must forward required sandbox port ${missingPort}\n`)
      .join('');
    process.stderr.write(errorMessages);
    return false;
  }

  process.stdout.write(`✓ ${file} is valid (${result.data.name}, agent: ${result.data.agent})\n`);
  return true;
}

type PackageConfig = Readonly<{
  packageManager?: string;
  engines?: Readonly<{ bun?: string }>;
}>;

type MiseConfig = Readonly<{
  tools?: Readonly<Record<string, string>>;
}>;

function checkToolchainParity(): boolean {
  const miseFile = 'mise.toml';
  const packageFile = 'package.json';

  if (!existsSync(miseFile) || !existsSync(packageFile) || !existsSync(kitSpecFile)) {
    process.stderr.write('Missing required config files for toolchain parity check\n');
    return false;
  }

  const mise = Bun.TOML.parse(readFileSync(miseFile, 'utf8')) as MiseConfig;
  const package_ = JSON.parse(readFileSync(packageFile, 'utf8')) as PackageConfig;
  const rawKit = readFileSync(kitSpecFile, 'utf8');

  const miseBun = mise.tools?.['bun'];
  const miseBeads = mise.tools?.['github:gastownhall/beads'];

  if (!miseBun) {
    process.stderr.write(`${miseFile} missing tools.bun definition\n`);
    return false;
  }

  // Check package.json packageManager if present
  if (package_.packageManager) {
    const packageManagerBun = package_.packageManager.replace(/^bun@/, '');
    if (packageManagerBun !== miseBun) {
      process.stderr.write(
        `Version mismatch: ${packageFile} packageManager (${package_.packageManager}) does not match ${miseFile} bun (${miseBun})\n`,
      );
      return false;
    }
  }

  // Check package.json engines.bun
  if (package_.engines?.bun && package_.engines.bun !== miseBun) {
    process.stderr.write(
      `Version mismatch: ${packageFile} engines.bun (${package_.engines.bun}) does not match ${miseFile} bun (${miseBun})\n`,
    );
    return false;
  }

  const kitBunMatch = rawKit.match(/bun@([0-9]+\.[0-9]+\.[0-9]+)/);
  if (!kitBunMatch?.[1]) {
    process.stderr.write(
      `${kitSpecFile} does not declare an explicit bun version (expected bun@<semver>)\n`,
    );
    return false;
  }

  if (kitBunMatch[1] !== miseBun) {
    process.stderr.write(
      `Version mismatch: ${kitSpecFile} declares bun@${kitBunMatch[1]}, but ${miseFile} declares ${miseBun}\n`,
    );
    return false;
  }

  if (miseBeads) {
    const kitBeadsMatch = rawKit.match(
      /(?:github:gastownhall\/beads|beads)@([0-9]+\.[0-9]+\.[0-9]+)/,
    );
    if (!kitBeadsMatch?.[1]) {
      process.stderr.write(
        `${kitSpecFile} does not declare an explicit beads version (expected beads@<semver>)\n`,
      );
      return false;
    }
    if (kitBeadsMatch[1] !== miseBeads) {
      process.stderr.write(
        `Version mismatch: ${kitSpecFile} declares beads@${kitBeadsMatch[1]}, but ${miseFile} declares ${miseBeads}\n`,
      );
      return false;
    }
  }

  process.stdout.write(`✓ Toolchain parity verified: bun@${miseBun}, beads@${miseBeads}\n`);
  return true;
}

const kitPassed = checkKitSpec(kitSpecFile);
const environmentPassed = filesToCheck.every(checkFile);
const parityPassed = checkToolchainParity();

if (!kitPassed || !environmentPassed || !parityPassed) {
  process.exit(1);
}

// When running in an environment where sbx CLI is installed, also run native sbx kit validate
checkKitWithSbxIfAvailable(kitDirectory);
