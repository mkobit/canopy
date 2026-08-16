# Playbook: eliminating an `eslint-disable` directive

Companion to the code-design review (`2026-08-15-code-design-smells-review.md`).
Every "eliminate `<rule>` in `<package>`" bead points here.
This is the self-contained procedure a remote agent (Jules) follows — it assumes no prior context.

## The rule

We own nearly all of this code, so an `eslint-disable` directive is a defect to remove, not a comment to add.
Rewrite the code so the rule passes honestly.
Do **not** add a new `eslint-disable`, do **not** widen `ignoreTypePattern`, do **not** add `-- reason` and call it done.
The only acceptable remaining disable is one where an **external library's** type or API forces it — and that must be a single-line disable with a `-- <reason>` naming the library.

## Hard constraints

- **Blocked on the toolkit decision.** Do not start a kernel-package rewrite (`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage*`) until the kernel-toolkit design bead is closed. It decides Effect-in-kernel vs plain-functional + shared helpers; the recipes below assume the plain-functional default and must be adjusted if Effect is chosen. Apps/adapter (`api-adapter`, `web`, `cli`, `daemon`, `clip-host`, `extension`) already use Effect and may proceed.
- **Never touch `packages/graph/src/incremental-projection.ts` or `packages/graph/src/indexes.ts`.** They are perf-critical and owned by their own design bead.
- **Never change behavior.** These are mechanical, behavior-preserving rewrites. If a rewrite would change semantics, stop and leave a note on the bead.
- **Perf-based modules:** if the bead marks a file perf-based, its perf/load test must exist and stay green — do not land without it.

## Per-rule recipes (plain-functional default)

### `functional/no-let`

Replace reassignment with a `const` bound to an expression.

- Accumulation in a loop → `array.reduce(...)`.
- Conditional assignment → ternary or a small pure helper returning the value.
- "compute then maybe adjust" → a helper function whose `return` is the final value.

### `functional/no-loop-statements`

Replace `for`/`while` with array combinators over a `readonly` input:

- transform each → `.map`
- filter → `.filter`
- fold to one value → `.reduce`
- side effect per item at a true boundary → `for...of` is still a loop; prefer `.forEach` only at an I/O boundary, otherwise restructure to return data.
- early exit → `.find` / `.some` / `.every`.

### `functional/immutable-data`

Never mutate an argument or captured object/array. Return a new value:

- object update → `{ ...prev, key: next }`
- array append → `[...prev, item]`; remove → `prev.filter(...)`; update-at → `.map`
- `Map`/`Set` update → build a new `Map`/`Set` from entries, or use a `readonly` record.
- If the mutation is genuinely a hot encapsulated accumulator, that is the perf-carve-out case — it belongs to a design bead, not this recipe.

### `functional/no-try-statements` and `functional/no-throw-statements`

Convert to the project's `Result<T, E>` (`packages/graph/src/result.ts`):

- a function that can fail returns `Result<T, E>`; callers branch on `ok`.
- wrap an unavoidable throwing external call in one small boundary helper that catches and returns `err(...)`; that helper is the single allowed `try` site, with a `-- <reason>` naming the external API.
- never re-`throw` for control flow.

### `functional/no-return-void` (callbacks, event/stream wiring)

- Prefer returning data over registering void callbacks. For pub/sub (`event-bus.ts`), evaluate an `Effect` `Stream` (if Effect adopted) or a pure subscriber-list reducer.
- At a real framework boundary that demands a void handler (DOM listener, stream `on('data')`), keep it minimal and, if unavoidable, a single-line disable with a `-- <reason>`.

### `functional/no-classes` and `functional/no-this-expressions`

Replace the class with a factory returning a `readonly` object of functions closing over state, or a pure state-transition function set (`(state, input) => nextState`). `workflow-engine.ts` is the main case.

### `@typescript-eslint/no-explicit-any`

Replace `any` with `unknown` + a Zod schema parse or an explicit type guard that narrows. At a WASM/JCO boundary, define a precise interface for the shape you consume rather than `any`.

### `@typescript-eslint/no-non-null-assertion` (mostly tests)

Replace `x!` with a narrowing check that fails loudly:

- in tests: `expect(x).toBeDefined()` then use `x`, or a `assertDefined(x)` helper that throws with a message; do not use `!`.
- in production: narrow with an explicit `if (x === undefined) return err(...)`.

### `@typescript-eslint/no-unsafe-type-assertion`

Parse/validate instead of asserting. If bridging an external (jco/WASM) shape, isolate the assertion in one adapter function with a `-- <reason>`, and give it a real return type.

## Definition of done (every rewrite bead)

1. The targeted `eslint-disable <rule>` directives for the bead's package are gone (or reduced to the explicitly-justified external-library residue, each single-line with `-- <reason>`).
2. `bun run lint`, `bun run typecheck`, and `bun test` are green for the touched workspaces.
3. No behavior change; no new disable; `ignoreTypePattern` unchanged.
4. For perf-based files, the perf/load test ran and did not regress.
5. Note on the bead: starting count → ending count for the rule, and any residue left with its justification.
