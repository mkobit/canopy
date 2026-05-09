## Why

`eslint-plugin-functional` is installed and three presets are active, but key rules have broad escape hatches that neutralize enforcement: `functional/prefer-immutable-types` carries a catch-all `ignoreTypePattern: ['.*']` that disables the rule for every type, and the web/UI packages turn off immutability rules wholesale — meaning mutable code can be written in production packages without any linting feedback, silently undermining the architectural invariant that all data is immutable.

## What changes

- Remove the catch-all `ignoreTypePattern: ['.*']` from `functional/prefer-immutable-types`; replace with specific, documented exceptions only
- Narrow the React/web overrides from wholesale `'off'` to rule-specific exceptions scoped to patterns that React genuinely requires (e.g., `ref.current` mutation)
- Promote `@typescript-eslint/no-non-null-assertion` from `'off'` to `'error'`
- Promote `@typescript-eslint/ban-ts-comment` from `'warn'` to `'error'` (suppression comments should require `@ts-expect-error` with explanation)
- Fix all pre-existing violations surfaced by the tightened rules so `bun run lint` passes clean

## Capabilities

### New capabilities

- `eslint-functional-enforcement`: Tightened ESLint configuration where `eslint-plugin-functional` rules are fully active with minimal, explicitly documented exceptions; enforced in CI

### Modified capabilities

<!-- None — no existing specs exist yet -->

## Impact

- `eslint.config.mjs` — primary change target
- All `packages/*/src/**/*.ts` and `apps/web/src/**/*.{ts,tsx}` — lint will fail on existing violations until they are fixed
- CI — lint must pass before merge; existing rule gaps may be masking real violations that need correction
