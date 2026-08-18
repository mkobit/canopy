import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Two hygiene invariants held only by convention until now: (1) a CI workflow
// can pin a Bun version that drifts from mise.toml, the single toolchain
// source (F1) -- openspec.yml did, pinning 1.3.12 against mise.toml's 1.3.14,
// discovered while scoping this guard; (2) a WASM/codegen output can be
// committed even though every emitting path is .gitignore'd (F6). See
// openspec/changes/codify-ci-tooling-guard/design.md.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');

export interface Violation {
  readonly kind: 'version-drift' | 'tracked-artifact';
  readonly message: string;
}

function listTrackedFiles(root: string, pathspecs: readonly string[]): readonly string[] {
  const output = execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\0').filter((entry) => entry.length > 0);
}

// --- CI workflow Bun-version consistency ------------------------------------

// Same anchored pattern as tools/verify-versions.ts's mise.toml read, kept as
// an intentional duplicate so each tools/*.ts guard stays a standalone script.
const MISE_BUN_PATTERN = /^bun\s*=\s*["']?([^"'\n]+)["']?/m;

export function readMiseBunVersion(miseToml: string): string | undefined {
  return MISE_BUN_PATTERN.exec(miseToml)?.[1];
}

const SETUP_BUN_STEP_PATTERN = /uses:\s*oven-sh\/setup-bun@/;
const STEP_START_PATTERN = /^(\s*)-\s/;
const NON_BLANK_INDENT_PATTERN = /^(\s*)\S/;
const BUN_VERSION_INPUT_PATTERN = /^\s*bun-version:\s*(.+?)\s*$/;
const ENV_REF_PATTERN = /^\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;
const FLOATING_VERSION_PATTERN = /^(latest|canary|nightly)$/i;
const ENV_BLOCK_START_PATTERN = /^env:\s*$/;
const ENV_ENTRY_PATTERN = /^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.+?)\s*$/;
const TOP_LEVEL_KEY_PATTERN = /^\S/;

function stripQuotes(value: string): string {
  return value.replaceAll(/^['"]|['"]$/g, '');
}

function enclosingStepIndent(lines: readonly string[], index: number): number {
  const stepStartIndent = lines
    .slice(0, index + 1)
    .map((line) => STEP_START_PATTERN.exec(line)?.[1]?.length)
    .findLast((indent): indent is number => indent !== undefined);
  return stepStartIndent ?? 0;
}

// Reads only the `bun-version:` input belonging to the setup-bun step at
// `usesIndex`, bounded to lines more indented than the step itself -- so a
// pin is never attributed to an unrelated, later step.
function pinForStepAt(lines: readonly string[], usesIndex: number): string | undefined {
  const stepIndent = enclosingStepIndent(lines, usesIndex);
  const following = lines.slice(usesIndex + 1);
  const boundaryOffset = following.findIndex((line) => {
    const indent = NON_BLANK_INDENT_PATTERN.exec(line)?.[1]?.length;
    return indent !== undefined && indent <= stepIndent;
  });
  const stepBody = boundaryOffset === -1 ? following : following.slice(0, boundaryOffset);
  const inputLine = stepBody.find((line) => BUN_VERSION_INPUT_PATTERN.test(line));
  return inputLine === undefined ? undefined : BUN_VERSION_INPUT_PATTERN.exec(inputLine)?.[1];
}

export function findSetupBunVersionPins(workflowText: string): readonly string[] {
  const lines = workflowText.split('\n');
  return lines
    .map((line, index) => (SETUP_BUN_STEP_PATTERN.test(line) ? index : undefined))
    .filter((index): index is number => index !== undefined)
    .map((index) => pinForStepAt(lines, index))
    .filter((pin): pin is string => pin !== undefined);
}

function environmentBlockLines(lines: readonly string[]): readonly string[] {
  const startIndex = lines.findIndex((line) => ENV_BLOCK_START_PATTERN.test(line));
  if (startIndex === -1) return [];
  const afterStart = lines.slice(startIndex + 1);
  const endOffset = afterStart.findIndex((line) => TOP_LEVEL_KEY_PATTERN.test(line));
  return endOffset === -1 ? afterStart : afterStart.slice(0, endOffset);
}

export function parseWorkflowEnvironment(workflowText: string): ReadonlyMap<string, string> {
  const entries = environmentBlockLines(workflowText.split('\n'))
    .map((line) => ENV_ENTRY_PATTERN.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1] as string, stripQuotes(match[2] as string)] as const);
  return new Map(entries);
}

export function resolvePinValue(
  rawValue: string,
  workflowEnvironment: ReadonlyMap<string, string>,
): string | undefined {
  const environmentReferenceMatch = ENV_REF_PATTERN.exec(rawValue);
  if (environmentReferenceMatch?.[1] !== undefined)
    return workflowEnvironment.get(environmentReferenceMatch[1]);
  const literal = stripQuotes(rawValue);
  return literal.includes('${{') ? undefined : literal;
}

export type PinClassification = 'compliant' | 'floating' | 'drift' | 'unresolved';

export function classifyPin(
  resolvedValue: string | undefined,
  miseBunVersion: string,
): PinClassification {
  if (resolvedValue === undefined) return 'unresolved';
  if (FLOATING_VERSION_PATTERN.test(resolvedValue)) return 'floating';
  if (!/^\d/.test(resolvedValue)) return 'unresolved';
  return resolvedValue === miseBunVersion ? 'compliant' : 'drift';
}

export function checkWorkflowVersionConsistency(
  relativePath: string,
  workflowText: string,
  miseBunVersion: string,
): readonly Violation[] {
  const workflowEnvironment = parseWorkflowEnvironment(workflowText);
  return findSetupBunVersionPins(workflowText).flatMap((rawValue): readonly Violation[] => {
    const resolvedValue = resolvePinValue(rawValue, workflowEnvironment);
    const classification = classifyPin(resolvedValue, miseBunVersion);

    if (classification === 'compliant' || classification === 'floating') return [];

    if (classification === 'unresolved') {
      return [
        {
          kind: 'version-drift',
          message:
            `${relativePath} pins bun-version "${rawValue}" which could not be resolved to ` +
            `a concrete version; use a literal version or install Bun via jdx/mise-action instead`,
        },
      ];
    }

    return [
      {
        kind: 'version-drift',
        message:
          `${relativePath} pins Bun ${resolvedValue ?? rawValue}, but mise.toml pins ` +
          `${miseBunVersion} -- align the workflow's Bun version to mise.toml (or install via jdx/mise-action)`,
      },
    ];
  });
}

function checkVersionConsistency(root: string): readonly Violation[] {
  const miseBunVersion = readMiseBunVersion(readFileSync(path.join(root, 'mise.toml'), 'utf8'));
  if (miseBunVersion === undefined) {
    return [
      {
        kind: 'version-drift',
        message:
          'mise.toml has no parseable "tools.bun" entry; cannot verify CI workflow Bun-version pins against it',
      },
    ];
  }

  return listTrackedFiles(root, ['.github/workflows/*.yml']).flatMap((relativePath) =>
    checkWorkflowVersionConsistency(
      relativePath,
      readFileSync(path.join(root, relativePath), 'utf8'),
      miseBunVersion,
    ),
  );
}

// --- Generated plugin-output artifact hygiene -------------------------------

// Each pattern is commented with the codegen stage (`bun run codegen:wit`,
// which runs apps/web/scripts/wit-codegen.ts + package-plugin.ts) that emits
// it -- kept in sync with the "Generated guest plugin outputs & WIT types"
// header comment in .gitignore.
const GENERATED_ARTIFACT_PATTERNS: readonly Readonly<{ pattern: RegExp; stage: string }>[] = [
  { pattern: /(^|\/)guest\.js$/, stage: 'guest plugin bundle output (bun run codegen:wit)' },
  { pattern: /(^|\/)plugin\.wasm$/, stage: 'jco transpile output (bun run codegen:wit)' },
  { pattern: /\/transpiled\//, stage: 'jco transpile output (bun run codegen:wit)' },
  { pattern: /(^|\/)plugin-node\.json$/, stage: 'plugin manifest output (bun run codegen:wit)' },
  {
    pattern: /^apps\/web\/src\/plugin\/types\//,
    stage: 'jco types output (bun run codegen:wit)',
  },
];

export function matchesGeneratedArtifact(
  relativePath: string,
): Readonly<{ stage: string }> | undefined {
  return GENERATED_ARTIFACT_PATTERNS.find(({ pattern }) => pattern.test(relativePath));
}

function checkArtifactHygiene(root: string): readonly Violation[] {
  return listTrackedFiles(root, []).flatMap((relativePath): readonly Violation[] => {
    const match = matchesGeneratedArtifact(relativePath);
    return match === undefined
      ? []
      : [
          {
            kind: 'tracked-artifact',
            message:
              `${relativePath} is tracked by git but matches the generated-artifact pattern for ` +
              `${match.stage}; it must stay untracked -- run: git rm --cached ${relativePath}`,
          },
        ];
  });
}

// --- Entry point -------------------------------------------------------------

function main(): undefined {
  const violations = [
    ...checkVersionConsistency(rootDirectory),
    ...checkArtifactHygiene(rootDirectory),
  ];

  if (violations.length > 0) {
    const report = violations
      .map((violation) => `  - [${violation.kind}] ${violation.message}`)
      .join('\n');
    process.stderr.write(
      `❌ CI tooling guard found ${violations.length} violation(s):\n${report}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    '✅ CI tooling guard passed: workflow Bun-version pins match mise.toml, no generated plugin-output artifact is tracked.\n',
  );
  return undefined;
}

// Only run when invoked directly (`bun tools/…`), not when imported by the test.
if (import.meta.main) {
  main();
}
