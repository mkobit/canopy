import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPluginArtifacts } from './check-plugin-artifacts';

const writeMetadata = (
  directory: string,
  target: 'main' | 'worker',
  modules: readonly string[],
): void => {
  writeFileSync(
    path.join(directory, `canopy-${target}-module-metadata.json`),
    `${JSON.stringify({
      target,
      chunks: [
        {
          fileName: `${target}.js`,
          facadeModuleId: modules[0] ?? null,
          isDynamicEntry: false,
          isEntry: true,
          modules,
        },
      ],
    })}\n`,
  );
};

describe('plugin artifact checker', () => {
  test('accepts transport-free main and worker metadata', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'canopy-artifacts-'));
    writeMetadata(directory, 'main', ['/repo/apps/web/src/main.tsx']);
    writeMetadata(directory, 'worker', ['/repo/apps/web/src/plugin/runtime/render-worker.ts']);
    expect(checkPluginArtifacts(directory)).toEqual({ ok: true, errors: [] });
  });

  test('fails closed when worker metadata is missing', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'canopy-artifacts-'));
    writeMetadata(directory, 'main', ['/repo/apps/web/src/main.tsx']);
    expect(checkPluginArtifacts(directory).ok).toBe(false);
  });

  test('rejects api-adapter reachability in either artifact', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'canopy-artifacts-'));
    writeMetadata(directory, 'main', [
      '/repo/apps/web/src/main.tsx',
      '/repo/packages/api-adapter/src/graphql/schema.ts',
    ]);
    writeMetadata(directory, 'worker', ['/repo/apps/web/src/plugin/runtime/render-worker.ts']);
    const result = checkPluginArtifacts(directory);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('api-adapter'))).toBe(true);
  });

  test.each([
    ['main', '/repo/node_modules/graphql/index.js'],
    ['worker', '/repo/node_modules/graphql/index.js'],
    ['worker', '/repo/node_modules/@connectrpc/connect/dist/index.js'],
    ['main', '/repo/packages/example/src/graphql/schema.ts'],
    ['worker', '/repo/packages/example/src/connect/handler.ts'],
    ['main', '/repo/packages/example/src/ipc/client.ts'],
  ] as const)('rejects %s metadata reachability for transport module %s', (target, moduleId) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'canopy-artifacts-'));
    writeMetadata(directory, 'main', [
      '/repo/apps/web/src/main.tsx',
      ...(target === 'main' ? [moduleId] : []),
    ]);
    writeMetadata(directory, 'worker', [
      '/repo/apps/web/src/plugin/runtime/render-worker.ts',
      ...(target === 'worker' ? [moduleId] : []),
    ]);

    expect(checkPluginArtifacts(directory).ok).toBe(false);
  });

  test('rejects the renderer-unavailable fixture in production metadata', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'canopy-artifacts-'));
    writeMetadata(directory, 'main', [
      '/repo/apps/web/src/main.tsx',
      '/repo/apps/web/e2e/fixtures/renderer-unavailable/main.tsx',
    ]);
    writeMetadata(directory, 'worker', ['/repo/apps/web/src/plugin/runtime/render-worker.ts']);
    expect(checkPluginArtifacts(directory).ok).toBe(false);
  });
});
