import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDirectory, 'package.json');
const miseTomlPath = path.join(rootDirectory, 'mise.toml');

// eslint-disable-next-line no-console
console.log('Verifying version consistency...');

type PackageJson = Readonly<{
  engines?: Readonly<{ bun?: string }>;
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
  peerDependencies?: Readonly<Record<string, string>>;
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

// Verify Beads
const miseBeadsMatch = miseToml.match(
  /["']?(?:github:gastownhall\/)?beads["']?\s*=\s*["']?([^"'\n]+)["']?/,
);

if (!miseBeadsMatch) {
  console.error('Error: "beads" version not found in mise.toml');
  process.exit(1);
}

const miseBeadsVersion = miseBeadsMatch[1];

// Verify workspace package dependency version uniformity
const findPackageJsonFiles = (baseDirectory: string): readonly string[] => {
  const rootPackage = fs.existsSync(path.join(baseDirectory, 'package.json'))
    ? [path.join(baseDirectory, 'package.json')]
    : [];

  const subdirectories = ['apps', 'packages', 'tools'];
  const childPackages = subdirectories.flatMap((subdir) => {
    const parentDirectory = path.join(baseDirectory, subdir);
    if (!fs.existsSync(parentDirectory)) {
      return [];
    }
    const entries = fs.readdirSync(parentDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parentDirectory, entry.name, 'package.json'))
      .filter((candidatePath) => fs.existsSync(candidatePath));
  });

  return [...rootPackage, ...childPackages];
};

type DependencyOccurrence = Readonly<{
  filePath: string;
  dependencyName: string;
  version: string;
  section: string;
}>;

const packageFiles = findPackageJsonFiles(rootDirectory);

const allOccurrences = packageFiles.flatMap((filePath): readonly DependencyOccurrence[] => {
  const relativePath = path.relative(rootDirectory, filePath);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageJson;
  const sections: readonly (readonly [string, Readonly<Record<string, string>> | undefined])[] = [
    ['dependencies', content.dependencies],
    ['devDependencies', content.devDependencies],
    ['peerDependencies', content.peerDependencies],
  ];

  return sections.flatMap(([sectionName, sectionObject]): readonly DependencyOccurrence[] => {
    if (!sectionObject) {
      return [];
    }
    return Object.entries(sectionObject)
      .filter(([, version]) => !version.startsWith('workspace:'))
      .map(([dependencyName, version]): DependencyOccurrence => ({
        filePath: relativePath,
        dependencyName,
        version,
        section: sectionName,
      }));
  });
});

/* eslint-disable functional/prefer-immutable-types, functional/immutable-data -- local mutable accumulator in self-contained IIFE */
const occurrencesByDependency: Readonly<Record<string, readonly DependencyOccurrence[]>> = (() => {
  const result: Record<string, readonly DependencyOccurrence[]> = {};
  // eslint-disable-next-line functional/no-loop-statements -- grouping occurrences by dependency name
  for (const occurrence of allOccurrences) {
    const currentList = result[occurrence.dependencyName] ?? [];
    result[occurrence.dependencyName] = [...currentList, occurrence];
  }
  return result;
})();
/* eslint-enable functional/prefer-immutable-types, functional/immutable-data */

const driftedEntries = Object.entries(occurrencesByDependency).filter(
  ([, occurrences]) => new Set(occurrences.map((occurrence) => occurrence.version)).size > 1,
);

if (driftedEntries.length > 0) {
  // eslint-disable-next-line functional/no-loop-statements -- logging error details requires iteration
  for (const [dependencyName, occurrences] of driftedEntries) {
    console.error(`\nDependency version drift detected for "${dependencyName}":`);
    // eslint-disable-next-line functional/no-loop-statements -- logging error details requires iteration
    for (const occurrence of occurrences) {
      console.error(`  - ${occurrence.filePath} (${occurrence.section}): ${occurrence.version}`);
    }
  }
  console.error('\nError: Workspace dependency version drift must be resolved before proceeding.');
  process.exit(1);
}

// eslint-disable-next-line no-console -- final status report
console.log(
  `✅ Versions match: Bun ${packageBunVersion}, Beads ${miseBeadsVersion}, Workspace dependencies aligned`,
);
