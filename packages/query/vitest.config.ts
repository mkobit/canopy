import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    alias: {
      '@canopy/core/src/ops': path.resolve(__dirname, '../core/src/ops.ts'),
      '@canopy/core/src/system': path.resolve(__dirname, '../core/src/system.ts'),
      '@canopy/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@canopy/types': path.resolve(__dirname, '../types/src/index.ts'),
      '@canopy/schema': path.resolve(__dirname, '../schema/src/index.ts'),
    },
  },
});
