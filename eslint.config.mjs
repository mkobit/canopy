import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';
import functional from 'eslint-plugin-functional';
import importPlugin from 'eslint-plugin-import';
import unicorn from 'eslint-plugin-unicorn';
import stylistic from '@stylistic/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import promisePlugin from 'eslint-plugin-promise';
import checkFilePlugin from 'eslint-plugin-check-file';

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
      'apps/web/src/plugin/mock/**/*',
      'apps/web/src/plugin/draft-session-shim.ts',
      'apps/web/scripts/**/*',
      '**/transpiled/**/*',
    ],
  },
  // Base configurations
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  promisePlugin.configs['flat/recommended'],
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
        projectService: {
          allowDefaultProject: ['tools/*.ts'],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },
  // Enforce no unsafe type assertions across all apps/web files (including test files,
  // excluding the matchMedia polyfill in test/setup.ts which requires `as any`).
  // Core packages are excluded until they receive a systematic audit.
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    ignores: ['apps/web/src/test/setup.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
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
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-var-requires': 'off',

      // Import plugin rules
      'import/extensions': ['error', 'never', { json: 'always' }],
      'import/no-unresolved': 'off', // TypeScript handles this
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/index', '**/index.ts', '**/index.tsx'],
              message:
                'Importing from barrel files (index.ts) is restricted to avoid circular dependencies.',
            },
          ],
        },
      ],

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
      'max-params': ['error', 6],
      'max-lines-per-function': ['error', 100],
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
          // Allowlist for third-party class types we cannot annotate as readonly.
          // Rule: NEVER widen the allowlist with `.*` and NEVER disable this rule per-package.
          // When a new third-party type causes false positives, add a narrow pattern here with
          // a one-line source comment. For internal-only mutation, prefer a single-line
          // `eslint-disable-next-line` at the call site with a reason.
          ignoreTypePattern: [
            '^Readonly', // Readonly, ReadonlyMap, ReadonlySet, ReadonlyArray
            '^Zod', // Zod schema instances (mutable internals)
            String.raw`^z\.Zod`, // namespaced Zod refs (z.ZodType, z.ZodObject)
            '^Error$', // built-in JS Error class
            '^FC<', // React.FC unaliased
            String.raw`^React\.`, // React.MouseEvent, React.ReactElement, React.FC, etc.
            '^EdgeProps', // xyflow edge props
            '^NodeProps', // xyflow node props
            '^Connection$', // xyflow Connection
            '^Page$', // Playwright Page fixture (e2e helper function params)
            '^Locator$', // Playwright Locator (e2e helper function params)
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
        {
          name: 'alert',
          message: 'Use custom alert components or notifications instead of standard alert().',
        },
        {
          name: 'prompt',
          message: 'Use custom modals or inputs instead of standard prompt().',
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

  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Not needed for React 17+
      'react/prop-types': 'off', // We use TypeScript
      'no-restricted-globals': [
        'error',
        {
          name: 'alert',
          message: 'Use custom alert components or notifications instead of standard alert().',
        },
        {
          name: 'prompt',
          message: 'Use custom modals or inputs instead of standard prompt().',
        },
        {
          name: 'Date',
          message: 'Use Temporal instead of Date.',
        },
      ],
    },
    settings: {
      react: {
        version: '18.2.0',
      },
    },
  },

  // Ban `Date` global in test files too — Temporal everywhere, including fixtures.
  // The main config block above (with `no-restricted-globals` banning Date) excludes test files;
  // this re-applies the Date ban specifically so tests can't drift back to `new Date()` / `Date.now()`.
  {
    files: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/tests/**/*.ts',
      '**/__tests__/**/*.ts',
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/tests/**/*.tsx',
      '**/__tests__/**/*.tsx',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message: 'Use Temporal instead of Date.',
        },
      ],
    },
  },

  // === Specific Overrides (Must come last to win) ===

  {
    plugins: {
      'check-file': checkFilePlugin,
    },
    files: ['packages/**/*', 'apps/**/*'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {
          '**/*.{ts,tsx,js,jsx}': 'KEBAB_CASE',
        },
        {
          ignoreMiddleExtensions: true,
        },
      ],
    },
  },

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
      'unicorn/prefer-math-min-max': 'off', // Project uses Instant (ISO strings) for timestamps; Math.max() does not work with strings
      'unicorn/prefer-iterator-to-array': 'off', // Requires Iterator.prototype.toArray() which is not typed in the configured TS ES2023 target
      'unicorn/no-useless-recursion': 'off', // Conflicts with functional programming style banning loops
      'unicorn/no-non-function-verb-prefix': 'off', // Banned for variables like addResult or addParentResult
      'unicorn/consistent-boolean-name': 'off', // Too restrictive for domain terms like lwwWins
      'unicorn/max-nested-calls': 'off', // Too restrictive for test suites and schema definitions
      'unicorn/prefer-await': 'off', // Conflicts with functional/no-try-statements since await requires try-catch
      'unicorn/no-declarations-before-early-exit': 'off', // Conflicts with React Hook rules which require calling hooks before early exits
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
    files: ['packages/graph/src/schemas.ts'],
    rules: {
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-method-this-argument': 'off',
    },
  },

  // React/UI: disable only the FP rules that React's model is inherently incompatible with
  // (effectful event handlers, void returns, mixed prop types). Immutability rules stay on.
  {
    files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
    rules: {
      'functional/no-expression-statements': 'off',
      'functional/no-return-void': 'off',
      'functional/no-mixed-types': 'off',
    },
  },
  // Workaround for crashing rule in typescript-eslint v8.54.0
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-generic-constructors': 'off',
    },
  },
  // Exceptions for mutable state in adapters/stores (since they encapsulate it behind pure interfaces).
  // Note: prefer-immutable-types and type-declaration-immutability remain ON — public signatures
  // accept immutable types even when implementations mutate encapsulated fields.
  {
    files: [
      'packages/storage/src/**/*.ts',
      'packages/storage-file/src/**/*.ts',
      'packages/storage-indexeddb/src/**/*.ts',
      'packages/storage-sqlite/src/**/*.ts',
    ],
    rules: {
      'functional/no-let': 'off',
      'functional/immutable-data': 'off',
      'functional/no-return-void': 'off',
      'functional/no-mixed-types': 'off',
      'functional/readonly-type': 'off',
    },
  },
);
