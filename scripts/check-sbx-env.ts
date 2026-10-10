import { readFileSync, existsSync } from 'node:fs';

const kitSpecFile = '.sbx/kit/spec.yaml';

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

const parityPassed = checkToolchainParity();

if (!parityPassed) {
  process.exit(1);
}
