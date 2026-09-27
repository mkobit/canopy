import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const moduleMetadataPlugin = (target: 'main' | 'worker'): Readonly<Plugin> => ({
  name: `canopy-${target}-module-metadata`,
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle)
      .filter((output) => output.type === 'chunk')
      .map((chunk) => ({
        fileName: chunk.fileName,
        facadeModuleId: chunk.facadeModuleId,
        isDynamicEntry: chunk.isDynamicEntry,
        isEntry: chunk.isEntry,
        modules: Object.keys(chunk.modules).toSorted((left, right) => left.localeCompare(right)),
      }))
      .toSorted((left, right) => left.fileName.localeCompare(right.fileName));
    const fileName = `canopy-${target}-module-metadata.json`;
    this.emitFile({
      type: 'asset',
      fileName,
      source: `${JSON.stringify({ target, chunks }, undefined, 2)}\n`,
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), moduleMetadataPlugin('main')],
  worker: {
    plugins: () => [moduleMetadataPlugin('worker')],
  },
  resolve: {
    alias: {
      'canopy:graph/draft-session': fileURLToPath(
        new URL('src/plugin/draft-session-shim.ts', import.meta.url),
      ),
    },
  },
});
