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
    ...functional.configs.recommended,
    ...functional.configs.noMutations,
    // Disable type-checked rules for files without type info
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      ...functional.configs.recommended.rules,
      ...functional.configs.noMutations.rules,
      // Fix crash in prefer-immutable-types
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off',

      // Adjust rules for practicality
      'functional/no-return-void': 'off',
      'functional/no-expression-statements': 'off',
      'functional/no-mixed-types': 'off',
      'functional/functional-parameters': 'off',
      'functional/no-conditional-statements': 'off',
      // Classes and Throw are too fundamental to the current architecture to remove
      'functional/no-classes': 'off',
      'functional/no-throw-statements': 'off',
    },
    // Tests are naturally imperative (setup, state mutations in mock, etc.)
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts', '**/__tests__/**/*.ts'],
  },
  {
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
      'functional/immutable-data': ['error', {
          ignoreClasses: true,
          ignoreImmediateMutation: true,
          // Allow mutations of refs in React (common pattern)
          ignoreAccessorPattern: ['**.current', '**.value'],
      }],
    },
  },
);
