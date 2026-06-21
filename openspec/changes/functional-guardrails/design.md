## Context

`eslint-plugin-functional` v3 presets (`externalTypeScriptRecommended`, `recommended`, `stylistic`) are applied in `eslint.config.mjs` and cover all `.ts`/`.tsx` source files excluding test files.
However, two escape hatches render the config largely decorative:

1. `functional/prefer-immutable-types` includes `ignoreTypePattern: ['.*']` — the `.*` glob matches every type name, effectively setting the rule to `off` for all types.
2. The `packages/ui/**` and `apps/web/**` override block sets `functional/prefer-immutable-types: 'off'` and `functional/type-declaration-immutability: 'off'` with no scoping to specific problem patterns.

Running `bun run lint` today produces 0 errors — not because the codebase is clean, but because the rules are not active.
The architectural contract (all data immutable, no mutations outside adapter boundaries) is unenforced at the tooling layer.

## Goals / Non-Goals

**Goals:**

- `functional/prefer-immutable-types` is active and enforces `ReadonlyShallow` for all source types except a minimal, documented allowlist
- `@typescript-eslint/no-non-null-assertion` is set to `'error'`
- `@typescript-eslint/ban-ts-comment` is set to `'error'`
- React/UI overrides are scoped to the specific FP rules React's model inherently violates (expression statements, return void, conditional statements), not immutability
- `bun run lint` exits 0 after all pre-existing violations are fixed
- The known legitimate mutation zones (`packages/storage`, `packages/sync`) retain their targeted overrides

**Non-Goals:**

- Changing the functional programming style of any existing production code — the invariant is already supposed to be true
- Enabling `functional/no-expression-statements` or `functional/no-conditional-statements` globally — they are too aggressive for idiomatic TypeScript
- Covering test files — tests are already excluded from functional rules and this change preserves that
- Adding new linting plugins beyond what is already installed

## Decisions

### Remove `ignoreTypePattern: ['.*']` from `prefer-immutable-types`

The catch-all pattern was likely added as a temporary workaround when violations were found during initial setup.
Replace it with a specific allowlist of pattern prefixes that are genuinely read-only variants or come from third-party APIs where we can't control mutability annotations:

```
'ignoreTypePattern': [
  '^Readonly',        // Readonly, ReadonlyMap, ReadonlySet, ReadonlyArray
  '^Zod', '^z\\.Zod', // Zod schema instances are mutable third-party classes
  '^Y\\.',            // Yjs CRDT types are mutable by design
  '^Awareness$',      // y-protocols Awareness class
  '^Error$',          // built-in JS Error class
  '^FC<', '^React\\.', // React function components and event/element types
  '^EdgeProps', '^NodeProps', // xyflow component prop types
  '^Connection$',     // xyflow Connection type
]
```

The list grew during violation triage to cover third-party types we cannot annotate as readonly.
Each pattern has a one-line comment explaining the source.
If new legitimate cases arise, add them with a comment.

**Considered:** keeping `'.*'` and marking the rule as `'warn'` first, then escalating to `'error'`.
**Rejected:** warn mode produces noise without blocking merges; a clean fix-then-enforce cycle is cleaner.

### Scope React/UI overrides to FP-incompatible rules only

React components inherently use expression statements (`setState`, `useEffect` callbacks) and conditional rendering.
The correct override is:

```js
// apps/web/**
'functional/no-expression-statements': 'off',   // React side effects (hooks, event handlers)
'functional/no-return-void': 'off',             // event handlers return void
'functional/no-mixed-types': 'off',             // component prop types mix data + callbacks
```

Immutability rules (`prefer-immutable-types`, `type-declaration-immutability`) should remain active in React code — components receive immutable props and should declare them as such.

**Considered:** keeping the wholesale `'off'` overrides with a TODO comment.
**Rejected:** TODOs in config files become permanent; explicit scoping makes intent clear.

### Promote `@typescript-eslint/no-non-null-assertion` and `ban-ts-comment` to `'error'`

Non-null assertions (`!`) and `@ts-ignore` are escape hatches from type safety.
Both exist in the config at `'off'`/`'warn'` respectively with no documented reason.
Promoting to `'error'` forces explicit handling.
If a suppression is genuinely needed, `@ts-expect-error` with a description is the correct tool.

### Fix violations as part of this change

Any violations surfaced by the tightened rules are addressed in the same PR.
This avoids creating a backlog of known-bad code behind a `// eslint-disable` wall.
The fix scope covers all packages and `apps/web`.
`packages/storage` and `packages/sync` have overrides for legitimate internal mutation (`functional/immutable-data`, `functional/no-let`), but `functional/prefer-immutable-types` stays on so adapter public signatures remain immutable.

## Risks / Trade-offs

- [Risk] Tightening `prefer-immutable-types` may reveal many violations in `apps/web` components → Mitigation: audit violations before writing the PR; if volume is very high, the React override can be kept temporarily as `'warn'` with a tracked follow-up issue
- [Risk] `no-non-null-assertion: 'error'` may break existing code in non-obvious ways → Mitigation: fix violations in-place; non-null assertions are almost always replaceable with an explicit guard or type narrowing

## Migration plan

1. Tighten `eslint.config.mjs` (remove catch-all, scope React overrides, promote TS rules)
2. Run `bun run lint` to enumerate violations
3. Fix violations package-by-package (types → schema → core → query → storage/sync unchanged → web)
4. Confirm `bun run lint` exits 0
5. Confirm `bun run typecheck` still passes
6. Merge

Rollback: revert `eslint.config.mjs` to prior state — no data migration needed.

## Open questions

- None blocking — fix-volume will be determined empirically during implementation step 2.
