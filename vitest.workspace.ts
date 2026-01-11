import { defineWorkspace } from 'vitest/config';
import path from 'path';

export const alias = {
  '@canopy/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
  '@canopy/schema': path.resolve(__dirname, 'packages/schema/src/index.ts'),
  '@canopy/query': path.resolve(__dirname, 'packages/query/src/index.ts'),
  '@canopy/sync': path.resolve(__dirname, 'packages/sync/src/index.ts'),
  '@canopy/storage': path.resolve(__dirname, 'packages/storage/src/index.ts'),
  '@canopy/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
  '@canopy/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
  '@canopy/api': path.resolve(__dirname, 'packages/api/src/index.ts'),
};

const coverageConfig = {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.{ts,tsx}'],
  exclude: ['**/*.d.ts', '**/*.test.ts', '**/index.ts', '**/dist/**', '**/node_modules/**'],
};

export default defineWorkspace([
  {
    test: {
      name: 'node',
      environment: 'node',
      include: [
        'packages/core/**/*.test.ts',
        'packages/schema/**/*.test.ts',
        'packages/query/**/*.test.ts',
        'packages/sync/**/*.test.ts',
        'packages/storage/**/*.test.ts',
        'packages/types/**/*.test.ts',
        'packages/api/**/*.test.ts',
      ],
      exclude: ['**/node_modules/**', '**/dist/**'],
      alias,
      coverage: coverageConfig,
    },
  },
  {
    test: {
      name: 'dom',
      environment: 'jsdom',
      include: ['packages/ui/**/*.test.{ts,tsx}', 'apps/web/**/*.test.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      alias,
      setupFiles: ['apps/web/src/test/setup.ts'],
      coverage: coverageConfig,
    },
  },
]);
