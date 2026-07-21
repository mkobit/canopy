import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glob } from 'bun';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Helper to check if a command string starts with npm, npx, or node
function checkCommandString(command: string): string | undefined {
  const subCommands = command.split(/&&|\|\||;|\|/);
  const matched = subCommands
    .map((sub) => sub.trim())
    .filter(Boolean)
    .map((sub) => sub.match(/^(npm|npx|node)(?:\s|$)/))
    .find(Boolean);

  return matched?.[1];
}

interface Violation {
  readonly file: string;
  readonly location: string;
  readonly command: string;
  readonly forbiddenTool: string;
}

/* eslint-disable functional/readonly-type -- conflict with @typescript-eslint/array-type */

// Function to scan a single package.json
function scanPackageJson(relativePath: string, root: string): readonly Violation[] {
  const fullPath = path.join(root, relativePath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const json = JSON.parse(content) as {
    readonly scripts?: Readonly<Record<string, string>>;
  };
  const scripts = json.scripts;

  if (!scripts) {
    return [];
  }

  return Object.entries(scripts)
    .filter(([key]) => key !== 'preinstall')
    .map(([key, value]): Violation | undefined => {
      const forbiddenTool = checkCommandString(value);
      if (forbiddenTool) {
        return {
          file: relativePath,
          location: `script "${key}"`,
          command: value,
          forbiddenTool,
        };
      }
      return undefined;
    })
    .filter((v): v is Violation => v !== undefined);
}

// Function to scan a single Husky hook
function scanHuskyHook(fileName: string, huskyDir: string, root: string): readonly Violation[] {
  const fullPath = path.join(huskyDir, fileName);
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    return [];
  }

  const relativePath = path.relative(root, fullPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  return lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return undefined;
      }
      const forbiddenTool = checkCommandString(trimmed);
      if (forbiddenTool) {
        return {
          file: relativePath,
          location: `line ${index + 1}`,
          command: trimmed,
          forbiddenTool,
        };
      }
      return undefined;
    })
    .filter((v): v is Violation => v !== undefined);
}

/* eslint-enable functional/readonly-type */

async function main(): Promise<void> {
  const packageJsonGlob = new Glob('**/package.json');
  // eslint-disable-next-line functional/prefer-immutable-types -- mutable array used to collect results from async generator
  const rawPaths: string[] = [];
  // eslint-disable-next-line functional/no-loop-statements -- Glob scan requires async iteration
  for await (const relativePath of packageJsonGlob.scan(rootDir)) {
    // eslint-disable-next-line functional/immutable-data -- collect results
    rawPaths.push(relativePath);
  }

  const packageJsonPaths = rawPaths.filter(
    (p) => !p.includes('node_modules') && !p.includes('.beads'),
  );

  const packageJsonViolations = packageJsonPaths.flatMap((relPath) =>
    scanPackageJson(relPath, rootDir),
  );

  const huskyDir = path.join(rootDir, '.husky');
  const huskyFiles = fs.existsSync(huskyDir) ? fs.readdirSync(huskyDir) : [];
  const huskyViolations = huskyFiles.flatMap((file) => scanHuskyHook(file, huskyDir, rootDir));

  const allViolations = [...packageJsonViolations, ...huskyViolations];

  if (allViolations.length > 0) {
    // eslint-disable-next-line functional/no-loop-statements -- console logging violations requires loop
    for (const violation of allViolations) {
      console.error(
        `Error: ${violation.file} ${violation.location} contains forbidden command starting with "${violation.forbiddenTool}".`,
      );
      console.error(`Command: "${violation.command}"`);
      console.error(`Please use bun or bunx instead.\n`);
    }
    process.exit(1);
  }

  // eslint-disable-next-line no-console -- final success report
  console.log('✅ Developer scripts and hooks validation passed.');
}

main().catch((error: unknown): undefined => {
  console.error('Unhandled execution error:', error);
  process.exit(1);
});
