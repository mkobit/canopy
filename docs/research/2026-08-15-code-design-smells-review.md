# Code design & smells review

Track `canopy-rtk` of the whole-system review epic `canopy-v9o`.
Review/decision work only — each real change below still needs its own OpenSpec change + adversarial review before implementation, per project rules.

## Scope

A code-level read across all 14 workspaces for the smell classes the track bead names: unsafe casts, non-null assertions, broad `eslint-disable`s, `Result`-vs-`throw` consistency, immutability adherence, module-level mutable state, and test-helper / raw-DOM-query conventions (the `querySelector` cue that seeded the epic).
Produce a durable guard so the sharpest class of drift found here cannot silently return.

## Method

Enumerated every `eslint-disable` directive under `packages/**` and `apps/**` (excluding `dist/`, `transpiled/`, `node_modules/`), bucketed them by rule, by file, and by whether they carry the `-- <reason>` comment that `AGENTS.md` requires.
Cross-read the two densest files against the sibling files that express the same intent cleanly, then checked `eslint.config.mjs` for the enforcement that would make the written rule machine-checked.
Swept module-level mutable state, `throw` sites, and every `querySelector`/`getElementById` call to place them as production, test, or e2e.

## Directive census (as counted today)

`546` total `eslint-disable` directives across `packages/**` + `apps/**`.

Top rules disabled:

| Rule                                          | Count | Nature                                                 |
| :-------------------------------------------- | ----: | :----------------------------------------------------- |
| `functional/immutable-data`                   |   164 | encapsulated mutable builders (sanctioned pattern)     |
| `functional/no-loop-statements`               |    90 | imperative loops behind immutable signatures           |
| `functional/no-let`                           |    65 | local accumulators                                     |
| `functional/no-try-statements`                |    37 | boundary exception handling                            |
| `functional/no-return-void`                   |    28 | event-handler / stream wiring                          |
| `@typescript-eslint/no-non-null-assertion`    |    28 | **banned by `AGENTS.md`** — 27 of 28 are in test files |
| `@typescript-eslint/no-explicit-any`          |     9 | **banned by `AGENTS.md`** — WASM/JCO boundary + tests  |
| `@typescript-eslint/no-unsafe-type-assertion` |     3 | WASM/JCO boundary + one hook test                      |

The functional-family disables are, by policy, legitimate: `AGENTS.md` explicitly permits imperative implementations behind immutable public signatures ("adapter public signatures must stay immutable even when the implementation mutates encapsulated state").
The smell is not _that_ they exist — it is _how_ they are written and whether the written rules governing them are enforced.

## Findings

### F1 — the `-- reason` requirement is prose-only and unevenly followed (major)

`AGENTS.md` mandates that a localized escape hatch carry its rationale inline: "use a localized `// eslint-disable-next-line <rule> -- <reason>`".
Of the `546` directives, `374` carry no `--` reason at all — `347` of those are in production (non-test) code.
Nothing enforces the rule: `eslint.config.mjs` does not load `@eslint-community/eslint-plugin-eslint-comments`, so `require-description` is off and a reasonless disable lints clean.
The rule is real, written, and silently optional — the exact shape of drift this epic exists to close.

### F2 — two disable _styles_ coexist with no convention, and the reasonless mass concentrates in two files (major)

The repo already demonstrates the clean pattern: a single file-level block disable with one reason for a whole file whose mutation is the point —
`render-cache.ts` (`/* eslint-disable functional/immutable-data -- encapsulated LRU cache state (mutation is the point) */`), `frame-budget.ts`, and `execute-wasm-render-worker.ts` all do exactly this.
Yet the two densest files use the opposite style — dozens of bare per-line disables:

- `packages/graph/src/incremental-projection.ts` — `78` disables, **`0`** with a reason.
- `packages/graph/src/indexes.ts` — `77` disables, `5` with a reason.

These two files alone hold `150` reasonless `functional/*` disables, all expressing the same single idea (an encapsulated mutable projection/index builder).
Converting each to one file-level block with a reason — the pattern already blessed three files over — would remove ~150 directives and make the intent legible once instead of never.
There is no written convention that says _when_ to prefer a file-level block over per-line disables, so the choice is currently per-author.

### F3 — stale disables rot silently: `reportUnusedDisableDirectives` is unset (medium)

`eslint.config.mjs` has no `linterOptions.reportUnusedDisableDirectives`.
A disable that no longer suppresses anything (because the code moved or the rule stopped firing) lints clean forever.
With `546` directives in flight and active refactoring, this is a standing accumulator of dead escape hatches that no reviewer will catch by eye.

### F4 — banned `!` and `any` escape into tests with no codified test convention (medium)

The `AGENTS.md` escape-hatch guidance ("Banned: … non-null assertions `!`"; "no `any`") is written for production and adapter code; it is silent on test files.
As a result tests improvise: `27` of the `28` `no-non-null-assertion` disables live in `packages/storage-sqlite/src/sqlite-event-log.test.ts` (13), `packages/graph/src/history.test.ts` (12), and `packages/queries/tests/engine.equivalence.property.test.ts` (2) — and most carry no reason.
The one production non-null disable (`apps/web/src/main.tsx`, `#root` mount) is the single case `AGENTS.md` explicitly sanctions.
Tests reaching into known-shaped fixtures with `!` is defensible, but the convention should be _decided and written_ — is `!` allowed in tests, under what reason wording, or should tests narrow like production? — rather than left to per-file habit.

### F5 — `querySelector` (the seeding cue) resolves to mostly-legitimate, with one small production gap (context)

The cue that seeded the epic — raw `querySelector` usage — resolves as expected once placed:

- e2e / `__tests__` in-browser DOM (`apps/web/e2e/*.e2e.ts`, `graph-accessibility.test.ts`) — legitimate; the user already flagged the originally-noted case as fine.
- `apps/web/src/main.tsx` — the one `AGENTS.md`-sanctioned production case (`createRoot(document.querySelector('#root')!)`).
- `apps/extension/src/popup/popup.ts` — the one real gap: `8` module-level `document.querySelector<HTMLxxxElement>('#id')` consts whose `T | null` result is used without a uniform narrowing convention. The extension is a plain MV3 surface with zero `@canopy/*` deps, so this is isolated, but a small typed-lookup helper (or a documented convention) would standardize it.

The point of the cue was standardizing such conventions, not eliminating the calls — recorded here so the convention lives somewhere.

### F6 — `ignoreTypePattern` is disciplined; the third-party-type invariant holds (context, good)

`eslint.config.mjs`'s `ignoreTypePattern` has `23` entries, every one carrying a one-line source comment naming the third-party type it exempts (Zod, React, xyflow, Playwright, Effect, Storybook, DOMPurify, Web Worker).
There is no banned `.*` catch-all.
The `AGENTS.md` escape-hatch invariant for `prefer-immutable-types` on third-party types is followed exactly — no change needed, recorded so a future reviewer does not "tidy" it.

### F7 — module-level mutable state is confined to legitimately-imperative code (context)

Top-level / function-scope `let` outside tests appears only in `packages/storage-file/src/file-event-log.ts` (segment/manifest streaming I/O), `apps/clip-host/src/{index,framing,host}.ts` (stdio frame accumulation), and lazy-singleton caches (`markdown-render-plugin.ts`, `sanitize-html.ts`) — each already behind a disable with (mostly) a reason.
This is boundary I/O and encapsulated caches, not domain state leaking mutability; not a smell, recorded so it is not "fixed."

## Corrected direction (2026-08-15, owner)

The first cut of this review proposed _documenting_ the disables (add `-- reason`, block-scope the hot files) and enforcing that with `require-description`.
The owner rejected that framing: **because we own nearly all of this code, an `eslint-disable` directive is a smell to remove, not to annotate.**
The disable should be driven to zero — the imperative loop, `let`, mutation, or `try` behind it should be rewritten functionally (Effect, `Result<T, E>`, folds, readonly structural updates), and mutation should survive only where an external library forces it.
A small shared functional-helpers package may be warranted where use cases recur.
The findings above stand as the census; the remediation direction below replaces the original codification.

Decisions taken (see beads):

1. **Kernel toolkit is undecided and gets a design bead first.** `@canopy/graph` is Effect-free by design (dependency-light leaf, hand-rolled `Result`) yet holds the largest disable mass. Whether to adopt Effect in the kernel or stay Effect-free with plain functional patterns + a shared helper package is an architectural bet — decided in a design bead (OpenSpec + adversarial review) before any kernel rewrite. That design also weighs **splitting `@canopy/graph` into smaller packages** (ties `canopy-jxw`).
2. **The two perf-critical hot files get a design-first carve-out.** `incremental-projection.ts` and `indexes.ts` used mutation as a deliberate O(delta) choice (persistent/HAMT maps deferred in `canopy-c54`). Their disables are removed via a design bead that picks the approach (persistent structures vs `Effect` `Ref` vs a sanctioned mutable-behind-a-pure-boundary pattern) and **stands up perf/load tests first** — never a mechanical rewrite, never handed to a remote agent.
3. **Anything we deem perf-based must carry perf/load tests** (basic early on is fine, extended as the app fills in). Codified as an AGENTS.md rule plus an inventory of the modules that need benchmarks now.
4. **Work is chunked per (package, rule-category)** so it can be parceled across sessions or to remote Jules agents. Because Jules agents need explicit, self-contained instructions, the mechanical recipe lives once in the playbook (`docs/research/2026-08-15-eliminating-eslint-disables-playbook.md`) and every rewrite bead references it plus its own file/rule/count list. All rewrite beads depend on decision 1.

## Codification (the durable guards)

The guard is no longer "make disables self-documenting" but "**stop the count from ever rising and drive it down**":

### C1 — kill stale disables + ratchet the count in `eslint.config.mjs`

1. Set `linterOptions.reportUnusedDisableDirectives: "error"` — a disable that suppresses nothing fails lint (free win, land immediately).
2. A count-ceiling check wired into `bun run lint`: the number of `eslint-disable` directives may only decrease from a committed baseline; a new disable fails CI unless the baseline is explicitly lowered. This makes elimination a ratchet — every rewrite bead tightens the ceiling, and no new escape hatch can slip in.

Per `feedback_measure_before_gating_ci_checks`, dry-run the ceiling check against `main` first (baseline = current count) before gating.
Real change → codification bead needing OpenSpec + adversarial review.

### C2 — perf-test policy (decision 3)

AGENTS.md rule: a module labeled perf-based must carry perf/load tests; a rewrite that touches a perf-based module may not land without them.

## Bead summary

Filed under a dedicated elimination epic (origin: this review); all rewrite beads depend on the kernel-toolkit design.

- Design: kernel functional toolkit (Effect-in-kernel vs plain-functional + shared helper package) + `@canopy/graph` split evaluation — gates every rewrite.
- Design: perf-critical carve-out for `incremental-projection.ts` + `indexes.ts` (approach + benchmarks first).
- Codify: C1 ratchet (`reportUnusedDisableDirectives: "error"` + decreasing count ceiling) and C2 perf-test policy.
- Rewrite (per package × rule-category): `@canopy/graph` (immutable-data, no-loop, no-let, no-return-void, no-try/throw, no-classes/this, tests `!`, `any`), `@canopy/api-adapter`, `apps/web`, `@canopy/queries`, `@canopy/settings`, storage adapters, `apps/cli`, `apps/clip-host`, `apps/extension` — each references the playbook.
- Fix: F5 — standardize `apps/extension/src/popup/popup.ts` raw `querySelector` lookups (`canopy-rtk.4`, retained).
- Context: F6 (`ignoreTypePattern` disciplined) and F7 (module-level mutable state confined to boundary I/O) — re-examined case by case during rewrites, not assumed permanent.
