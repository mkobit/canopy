// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';
import functional from 'eslint-plugin-functional';
import importPlugin from 'eslint-plugin-import';
import unicorn from 'eslint-plugin-unicorn';
import stylistic from '@stylistic/eslint-plugin';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

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
  // Base configurations
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  unicorn.configs['flat/recommended'],
  stylistic.configs.customize({
    flat: true,
  }),
  // Prettier config must come after other configs to disable conflicting rules
  prettier,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },

  // Functional Plugin Presets
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

  // General Setup & Main Overrides
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
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/prefer-ts-expect-error': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-var-requires': 'off',

      // Import plugin rules
      'import/extensions': ['error', 'never', { json: 'always' }],
      'import/no-unresolved': 'off', // TypeScript handles this

      // Unicorn plugin rules
      'unicorn/numeric-separators-style': 'error',

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
      'functional/no-try-statements': 'error',
      'functional/no-expression-statements': 'off',
      'functional/functional-parameters': [
        'error',
        {
          enforceParameterCount: false,
        },
      ],
      'functional/no-conditional-statements': 'off',
      'functional/no-this-expressions': 'error',

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
        },
      ],

      // Ban Date and enforce Temporal
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message: 'Use Temporal instead of Date.',
        },
      ],
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            Date: {
              message: 'Use Temporal instead of Date.',
              fixWith: 'Temporal.PlainDate', // Suggestion only, specific fix depends on usage
            },
          },
        },
      ],
    },
  },

  // === Specific Overrides (Must come last to win) ===

  // Unicorn Overrides (Global)
  {
    rules: {
      'unicorn/filename-case': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/no-array-callback-reference': 'off', // Conflicts with functional/prefer-tacit
      'unicorn/import-style': 'off',
      'unicorn/no-useless-undefined': 'off', // Conflicts with functional/no-return-void
    },
  },

  // Specific file overrides
  {
    files: ['tools/verify-versions.ts'],
    rules: {
      'unicorn/no-process-exit': 'off',
    },
  },
  {
    files: ['vitest.workspace.ts', 'packages/*/vitest.config.ts', 'eslint.config.mjs'],
    rules: {
      'unicorn/prefer-module': 'off', // Allow CommonJS-ish patterns or __dirname in config files if needed, though usually they are modules.
    },
  },
  // Override for Zod schemas using .map() which confuses Unicorn
  {
    files: ['packages/schema/src/schemas.ts'],
    rules: {
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-method-this-argument': 'off',
    },
  },
  // Legacy/Imperative Packages (Sync, Storage)
  {
    files: ['packages/sync/**/*.ts', 'packages/storage/**/*.ts'],
    rules: {
      'functional/no-return-void': 'off',
      'functional/no-loop-statements': 'off',
    },
  },

  // Existing Legacy Overrides
  // TODO(canopy-q8x): Refactor legacy classes to functional patterns
  {
    files: [
      'packages/sync/**/*.ts',
      'packages/ui/**/*.tsx',
      'packages/ui/**/*.ts',
      'apps/web/**/*.tsx',
      'apps/web/**/*.ts',
    ],
    rules: {
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off',
    },
  },
  {
    files: ['packages/sync/**/*.ts', 'packages/storage/**/*.ts'],
    rules: {
      'functional/no-this-expressions': 'off',
    },
  },
);
