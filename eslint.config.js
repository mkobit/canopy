// eslint.config.js
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');
// eslint-plugin-functional v9 exports "default" with configs
const functional = require('eslint-plugin-functional').default;

module.exports = tseslint.config(
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
    ...functional.configs.lite,
    // Disable type-checked rules for files without type info
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
    },
    // We only apply these rules to TS files that are part of the project
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Overrides for lite config

      // Enforce immutability (part of lite, but tweaking)
      'functional/immutable-data': ['error', {
          ignoreClasses: true,
          ignoreImmediateMutation: true,
          // Allow mutations of refs in React (common pattern)
          ignoreAccessorPattern: ['**.current', '**.value'],
      }],
      'functional/no-let': ['warn', {
        allowInFunctions: true
      }],

      // Disable noisy rules from lite for now to make it manageable
      'functional/prefer-readonly-type': 'off',
      'functional/no-mixed-types': 'off',
      'functional/no-return-void': 'off',
      'functional/no-class-inheritance': 'off',
      'functional/no-this-expressions': 'off',
      'functional/no-throw-statements': 'off',
      'functional/no-loop-statements': 'off',
      'functional/prefer-immutable-types': 'off',
      'functional/functional-parameters': 'off',
    },
  },
  // Specific overrides for test files to allow mutation in setups
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts'],
    rules: {
      'functional/immutable-data': 'off',
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/prefer-ts-expect-error': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
);
