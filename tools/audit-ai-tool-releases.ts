import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../package.json');
const miseTomlPath = path.join(__dirname, '../mise.toml');

type PackageJson = Readonly<{
  devDependencies?: Readonly<Record<string, string>>;
}>;

type ToolAuditResult = Readonly<{
  name: string;
  configuredVersion: string;
  latestVersion: string;
  upToDate: boolean;
  error?: string;
}>;

const cleanVersion = (version: string): string => version.replace(/^[v^~]/, '');

function readConfiguredVersions(): Readonly<{
  openSpec: string;
  beads: string;
}> {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
  const miseToml = fs.readFileSync(miseTomlPath, 'utf8');

  const openSpecVersion = packageJson.devDependencies?.['@fission-ai/openspec'] ?? 'unknown';
  const miseBeadsMatch = miseToml.match(
    /["']?(?:github:gastownhall\/)?beads["']?\s*=\s*["']?([^"'\n]+)["']?/,
  );
  const beadsVersion = miseBeadsMatch?.[1] ?? 'unknown';

  return {
    openSpec: cleanVersion(openSpecVersion),
    beads: cleanVersion(beadsVersion),
  };
}

async function fetchLatestOpenSpecVersion(): Promise<string> {
  const response = await fetch('https://registry.npmjs.org/@fission-ai/openspec/latest');
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenSpec version: ${response.statusText}`);
  }
  const data = (await response.json()) as Readonly<{ version?: string }>;
  return data.version ? cleanVersion(data.version) : 'unknown';
}

async function fetchLatestBeadsVersion(): Promise<string> {
  const response = await fetch('https://api.github.com/repos/gastownhall/beads/releases/latest', {
    headers: {
      'User-Agent': 'Canopy-Audit-Script',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Beads version: ${response.statusText}`);
  }
  const data = (await response.json()) as Readonly<{ tag_name?: string }>;
  return data.tag_name ? cleanVersion(data.tag_name) : 'unknown';
}

function auditTool(
  name: string,
  configuredVersion: string,
  fetcher: () => Promise<string>,
): Promise<ToolAuditResult> {
  return fetcher()
    .then((latestVersion) => ({
      name,
      configuredVersion,
      latestVersion,
      upToDate: configuredVersion === latestVersion,
    }))
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name,
        configuredVersion,
        latestVersion: 'unknown',
        upToDate: false,
        error: errorMessage,
      };
    });
}

function formatResult(result: ToolAuditResult): string {
  if (result.error) {
    return `❌ ${result.name}: Error fetching latest release (${result.error})`;
  }
  if (result.upToDate) {
    return `✅ ${result.name}: Up to date (v${result.configuredVersion})`;
  }
  return `⚠️ ${result.name}: Update available! (Configured: v${result.configuredVersion}, Latest: v${result.latestVersion})`;
}

async function main(): Promise<boolean> {
  // eslint-disable-next-line no-console
  console.log('Auditing AI developer tool ecosystem releases...\n');

  const configured = readConfiguredVersions();

  const openSpecResult = await auditTool(
    'OpenSpec (@fission-ai/openspec)',
    configured.openSpec,
    fetchLatestOpenSpecVersion,
  );
  const beadsResult = await auditTool(
    'Beads (gastownhall/beads)',
    configured.beads,
    fetchLatestBeadsVersion,
  );

  const results: readonly ToolAuditResult[] = [openSpecResult, beadsResult];
  const lines = results.map(formatResult);

  // eslint-disable-next-line functional/no-loop-statements -- logging output lines
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }

  const hasUpdates = results.some((result) => !result.upToDate && !result.error);

  // eslint-disable-next-line no-console
  console.log('\n--- Audit Summary ---');
  if (hasUpdates) {
    // eslint-disable-next-line no-console
    console.log('One or more AI tools have newer releases available upstream.');
    // eslint-disable-next-line no-console
    console.log(
      'To upgrade, update package.json and mise.toml, then run `mise lock` and `bun run check:versions`.',
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('All AI developer tools are up to date with upstream releases.');
  }

  return true;
}

main().catch((error: unknown): undefined => {
  console.error('Unhandled audit error:', error);
  process.exit(1);
});
