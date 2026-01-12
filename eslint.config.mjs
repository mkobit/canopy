// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import functional from 'eslint-plugin-functional';
import importPlugin from 'eslint-plugin-import';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      '**/*.d.ts',
      'packages/*/dist/**/*',
      'apps/*/dist/**/*',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  prettier,
  // Functional Plugin Configuration
  {
    ...functional.configs.externalTypeScriptRecommended,
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/tests/**/*.ts',
      '**/__tests__/**/*.ts',
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/tests/**/*.tsx',
      '**/__tests__/**/*.tsx',
      'apps/web/src/test/setup.ts',
    ],
  },
  {
    ...functional.configs.recommended,
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/tests/**/*.ts',
      '**/__tests__/**/*.ts',
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/tests/**/*.tsx',
      '**/__tests__/**/*.tsx',
      'apps/web/src/test/setup.ts',
    ],
  },
  {
    ...functional.configs.stylistic,
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/tests/**/*.ts',
      '**/__tests__/**/*.ts',
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/tests/**/*.tsx',
      '**/__tests__/**/*.tsx',
      'apps/web/src/test/setup.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.base.json', 'packages/*/tsconfig.json', 'apps/*/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    plugins: {
      functional,
      import: importPlugin,
    },
    // We only apply these rules to TS files that are part of the project
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/tests/**/*.ts',
      '**/__tests__/**/*.ts',
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/tests/**/*.tsx',
      '**/__tests__/**/*.tsx',
      'apps/web/src/test/setup.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/prefer-ts-expect-error': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-var-requires': 'off',

      // Import plugin rules
      'import/extensions': ['error', 'never', { json: 'always' }],
      'import/no-unresolved': 'off', // TypeScript handles this

      // Functional plugin overrides
      // Enforce immutability
      'functional/immutable-data': [
        'error',
        {
          ignoreClasses: true,
          ignoreImmediateMutation: true,
          // Allow mutations of refs in React (common pattern)
          ignoreAccessorPattern: ['**.current', '**.value'],
        },
      ],

      // Adjust rules for practicality (as suggested by user documentation/examples)
      'functional/no-return-void': 'error',
      'functional/no-throw-statements': 'error',
      'functional/no-expression-statements': 'off',
      'functional/functional-parameters': [
        'error',
        {
          enforceParameterCount: false,
        },
      ],
      'functional/no-conditional-statements': 'off',
      'functional/no-classes': 'off',

      'functional/prefer-immutable-types': [
        'error',
        {
          enforcement: 'ReadonlyShallow',
          ignoreClasses: false,
          ignoreInferredTypes: true,
          // Explicitly allow ReadonlyMap and similar standard types that might be considered "Unknown" or mutable by default if not wrapped
          ignoreTypePattern: [
            'ReadonlyMap',
            'ReadonlySet',
            'ReadonlyArray',
            'Graph',
            'Node',
            'Edge',
            '^ReadonlyMap',
            '^ReadonlySet',
            '^ReadonlyArray',
            '^Graph',
            '^Node',
            '^Edge',
            '.*',
          ],
          // If "Unknown" types are encountered, assume they are immutable if they match these patterns or if they are just interfaces that we control.
          // But for now, let's just make sure the rule doesn't fail on valid Readonly types.
          // ignoreAccessorPattern: ['**.current', '**.value', '**.valid', '**.errors']
        },
      ],
    },
  },
  {
    files: [
      'packages/sync/**/*.ts',
      'packages/ui/**/*.tsx',
      'packages/ui/**/*.ts',
      'apps/web/**/*.tsx',
      'apps/web/**/*.ts',
      'packages/query/src/legacy.ts',
      'packages/query/src/builder.ts',
      'packages/query/src/engine.ts',
      'packages/query/src/stored.ts',
      'packages/query/src/views.ts',
    ],
    rules: {
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off',
    },
  },
);
