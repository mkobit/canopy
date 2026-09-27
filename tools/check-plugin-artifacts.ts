import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import ts from 'typescript';

const chunkSchema = z.object({
  fileName: z.string(),
  facadeModuleId: z.string().nullable(),
  isDynamicEntry: z.boolean(),
  isEntry: z.boolean(),
  modules: z.array(z.string()),
});

const metadataSchema = z.object({
  target: z.enum(['main', 'worker']),
  chunks: z.array(chunkSchema).min(1),
});

const forbiddenModuleFragments = [
  '@canopy/api-adapter',
  '/packages/api-adapter/',
  '/node_modules/graphql/',
  '/node_modules/@connectrpc/',
  '/src/graphql/',
  '/src/connect/',
  '/src/ipc/',
] as const;

export type PluginArtifactCheckResult = Readonly<{
  ok: boolean;
  errors: readonly string[];
}>;

const readMetadata = (file: string) => {
  if (!existsSync(file)) return undefined;
  const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
  if (parsed.error !== undefined) return undefined;
  const result = metadataSchema.safeParse(parsed.config);
  return result.success ? result.data : undefined;
};

export const checkPluginArtifacts = (distributionDirectory: string): PluginArtifactCheckResult => {
  const targets = ['main', 'worker'] as const;
  const errors = targets.flatMap((target): readonly string[] => {
    const metadataPath = path.join(distributionDirectory, `canopy-${target}-module-metadata.json`);
    const metadata = readMetadata(metadataPath);
    if (metadata === undefined || metadata.target !== target) {
      return [`Invalid ${target} production module metadata: ${metadataPath}`];
    }
    const modules = metadata.chunks.flatMap((chunk) => chunk.modules);
    const targetEntry =
      target === 'main' ? '/src/main.tsx' : '/src/plugin/runtime/render-worker.ts';
    const entryErrors = modules.some((moduleId) =>
      moduleId.replaceAll('\\', '/').endsWith(targetEntry),
    )
      ? []
      : [`${target} metadata does not contain its shipped entry ${targetEntry}`];
    const forbiddenErrors = modules
      .filter((moduleId) => {
        const normalizedModuleId = moduleId.replaceAll('\\', '/');
        return forbiddenModuleFragments.some((fragment) => normalizedModuleId.includes(fragment));
      })
      .map((moduleId) => `${target} production artifact reaches transport module ${moduleId}`);
    const fixtureErrors = modules
      .filter((moduleId) =>
        moduleId.replaceAll('\\', '/').includes('/e2e/fixtures/renderer-unavailable/'),
      )
      .map((moduleId) => `${target} production artifact contains test fixture ${moduleId}`);
    return [...entryErrors, ...forbiddenErrors, ...fixtureErrors];
  });
  return { ok: errors.length === 0, errors };
};

if (import.meta.main) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkPluginArtifacts(path.join(root, 'apps/web/dist'));
  if (!result.ok) {
    process.stderr.write(`${result.errors.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(
    'Plugin artifact check passed for production main and worker module graphs.\n',
  );
}
