## 1. Tighten ESLint configuration

- [ ] 1.1 Remove `ignoreTypePattern: ['.*']` catch-all from `functional/prefer-immutable-types`; replace with specific patterns (`'^Readonly'`, `'^ReadonlyMap'`, `'^ReadonlySet'`, `'^ReadonlyArray'`)
- [ ] 1.2 Replace the wholesale `functional/prefer-immutable-types: 'off'` and `functional/type-declaration-immutability: 'off'` in the React/UI override with targeted overrides (`no-expression-statements`, `no-return-void`, `no-mixed-types`) only
- [ ] 1.3 Set `@typescript-eslint/no-non-null-assertion` to `'error'`
- [ ] 1.4 Set `@typescript-eslint/ban-ts-comment` to `'error'`

## 2. Audit and fix violations

- [ ] 2.1 Run `bun run lint` and capture the full violation list
- [ ] 2.2 Fix `prefer-immutable-types` violations in `packages/graph/`
- [ ] 2.3 Fix `prefer-immutable-types` violations in `packages/queries/`
- [ ] 2.4 Fix `prefer-immutable-types` violations in `packages/settings/`
- [ ] 2.5 Fix `prefer-immutable-types` violations in `packages/storage/`
- [ ] 2.6 Fix `prefer-immutable-types` violations in `packages/sync/`
- [ ] 2.7 Fix `prefer-immutable-types` violations in `apps/web/`
- [ ] 2.8 Fix `no-non-null-assertion` violations across all packages
- [ ] 2.9 Fix `ban-ts-comment` violations across all packages

## 3. Verify

- [ ] 3.1 Run `bun run lint` — confirm 0 errors
- [ ] 3.2 Run `bun run typecheck` — confirm 0 errors
- [ ] 3.3 Run `bun test` — confirm all tests pass
