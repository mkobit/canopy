import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAllCodegenArtifacts,
  getDefaultTypeSpecSourcePath,
  loadAndParseTypeSpecFromDisk,
} from './lib/typespec-compiler';

interface ArtifactTarget {
  readonly label: string;
  readonly absolutePath: string;
  readonly content: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');

const checkMode = process.argv.includes('--check');
const sourcePath = getDefaultTypeSpecSourcePath(rootDirectory);
const parseResult = loadAndParseTypeSpecFromDisk(sourcePath);

if (!parseResult.ok) {
  process.stderr.write(`❌ Failed to parse TypeSpec at ${sourcePath}: ${parseResult.error}\n`);
  process.exit(1);
}

const artifacts = generateAllCodegenArtifacts(parseResult.value);
const targets: readonly ArtifactTarget[] = [
  {
    label: 'packages/graph-access/src/canopy-v0-contract.ts',
    absolutePath: path.join(rootDirectory, 'packages/graph-access/src/canopy-v0-contract.ts'),
    content: artifacts.contractTs,
  },
  {
    label: 'packages/plugin-host/src/wasm/wit-spec.ts',
    absolutePath: path.join(rootDirectory, 'packages/plugin-host/src/wasm/wit-spec.ts'),
    content: artifacts.witSpecTs,
  },
  {
    label: 'packages/plugin-host/schema-baselines/plugin.wit',
    absolutePath: path.join(rootDirectory, 'packages/plugin-host/schema-baselines/plugin.wit'),
    content: artifacts.witBaselineText,
  },
  {
    label: 'packages/plugin-host/schema-baselines/canopy-v0-typespec.json',
    absolutePath: path.join(
      rootDirectory,
      'packages/plugin-host/schema-baselines/canopy-v0-typespec.json',
    ),
    content: artifacts.typespecBaselineJson,
  },
];

if (checkMode) {
  const drifted = targets.filter(
    (target) =>
      !existsSync(target.absolutePath) ||
      readFileSync(target.absolutePath, 'utf8') !== target.content,
  );
  if (drifted.length > 0) {
    process.stderr.write(
      `❌ TypeSpec codegen drift detected in ${drifted.length} file(s):\n${drifted
        .map((target) => `  - ${target.label}`)
        .join('\n')}\nRun: bun tools/typespec-codegen.ts\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    '✅ TypeSpec codegen check passed: all generated artifacts match main.tsp.\n',
  );
  process.exit(0);
}

const writtenLabels = targets.map((target) => {
  writeFileSync(target.absolutePath, target.content, 'utf8');
  return target.label;
});

process.stdout.write(
  `✅ Generated ${writtenLabels.length} TypeSpec artifact(s) from packages/graph-access/typespec/main.tsp.\n`,
);
