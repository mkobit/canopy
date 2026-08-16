## Context

The whole-system review track `canopy-rtk` counted 546 `eslint-disable` directives and its owner reframed them: because Canopy owns nearly all of this code, a disable is a smell to **remove**, not annotate.
The follow-on epic `canopy-v9o.1` parcels that removal into 22 per-package × rule-category rewrite beads, all blocked on one upstream decision — the functional toolkit the kernel is rewritten against (`canopy-v9o.1.1`, this change).

Current state, measured for this change:

- `@canopy/graph` carries **250** disables, but **155** are the two perf-critical hot files (`incremental-projection.ts` 78, `indexes.ts` 77) already carved out to `canopy-v9o.1.2`. The real kernel target here is ~95 ordinary `functional/no-let`/`no-loop`/`immutable-data`/`no-try` disables in `projection.ts`, `graph-session.ts`, `event-bus.ts`, `history.ts`, `ops/*`, plus test-file `!`/`any`.
- The kernel is Effect-free by design: a dependency-light leaf (AGENTS.md invariant #1) with a hand-rolled `Result<T, E>` in `packages/graph/src/result.ts`.
- `effect` is declared only in `@canopy/api-adapter`, `apps/cli`, `apps/daemon`, `apps/clip-host`, and used as an **outer runner** — `Effect`/`Console` at the process/IPC edge — not woven through domain logic. No kernel-tier package consumes Effect's `Either` for domain error handling; they consume `@canopy/graph`'s `Result`.
- The sibling track `canopy-jxw` is actively tightening the leaf: its F2 removes `@canopy/graph`'s only internal dev-cycle dependency to restore true leaf-ness, and F4/F5 note the leaf must duplicate vocabulary precisely because it may not import "up" the graph.

Constraints: functional lint rules stay on for every package (AGENTS.md); the leaf invariant is load-bearing; the owner is strongly opposed to bucket packages (`types`, `schema`, `api`, and by extension a grab-bag `functional`); pre-release, so there is no external API compatibility to preserve.

## Goals / Non-Goals

**Goals:**

- Decide, once and durably, the functional toolkit for kernel-tier rewrites so the 22 rewrite beads can proceed without each re-litigating it.
- Preserve the leaf invariant and the dependency-light kernel while still driving disables toward zero.
- Give remote agents (Jules) an unambiguous, self-contained instruction: the playbook's plain-functional default becomes unconditional.
- Record the decision and its revisit triggers where future contributors will find them (ADR + spec).

**Non-Goals:**

- Rewriting any `eslint-disable` — that is the 22 downstream beads.
- The perf-critical carve-out for `incremental-projection.ts` / `indexes.ts` — owned by `canopy-v9o.1.2`.
- The ratchet guard (`reportUnusedDisableDirectives` + count ceiling) — owned by `canopy-v9o.1.3`.
- Deciding whether to split `@canopy/graph` on architectural grounds — owned by `canopy-jxw`; this change only records that disable-elimination does not motivate a split.
- Removing `effect` from the apps/adapter, or standardizing how the apps use it.

## Decisions

### D1 — The kernel stays Effect-free (Option B over Option A)

Kernel-tier packages (`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage*`) are rewritten with plain-functional patterns: `map`/`filter`/`reduce`/`fold`, the existing `Result<T, E>`, and `readonly` structural updates. `effect` is not added to any of them.

**Rationale:**

- **The leaf invariant is load-bearing and being tightened, not loosened.** Adding a large runtime dependency to `@canopy/graph` directly contradicts AGENTS.md #1 and the concurrent `canopy-jxw` work removing the leaf's last internal dep. The dependency would ripple: `queries`/`settings`/`storage*` all sit on the leaf.
- **"Uniformity with the apps" is largely illusory.** The apps use Effect as an outer runner, not for domain `Either`. Adopting Effect in the kernel would make the kernel _more_ Effect-dependent than the code it supposedly unifies with, and would still leave a `Result`↔`Effect` seam — just relocated to inside the kernel instead of at the adapter boundary where it is naturally a boundary concern.
- **The disables don't need Effect to disappear.** The ~95 non-hot-file kernel disables are `no-let`/`no-loop`/`immutable-data`/`no-try`. Each rewrites to a language construct (`reduce`, `map`, spread, `Result`) with zero library. Effect would be a heavy answer to a problem plain TypeScript already solves.
- **Breaking-change blast radius.** Replacing `Result<T, E>` with `Effect`/`Either` changes the public signature of nearly every kernel function; every kernel-tier and app call site branches on it. Pre-release we _can_ break it, but doing so buys nothing the plain-functional path doesn't.

**Alternative considered — Option A (adopt Effect in the kernel):** rejected. Genuine upside (structured concurrency, typed DI, rich combinators) is unused by current kernel code, which is synchronous projection/validation/ops over in-memory data. The cost (leaf-invariant violation, dependency weight on the most-depended-on package, a monorepo-wide `Result`→`Effect` migration) is real and immediate. If kernel code later genuinely needs Effect's concurrency/DI, that is a named revisit trigger (D5), not a reason to pay the cost speculatively now.

### D2 — No bucket package; recurring pure helpers live in the leaf

No `@canopy/functional` package is created. A pure helper that recurs across kernel-tier packages is added as a named, domain-neutral export of `@canopy/graph`, and only once a second caller exists. Single-caller helpers stay inline.

**Rationale:** the owner is strongly opposed to bucket packages, and `@canopy/graph` is already the universal leaf import, so a shared helper there costs no new dependency edge and no new package to version. The expected helper set is tiny — a test `assertDefined` (replaces banned `!` in tests), a `Result`-aware fold/`traverse` (collect a `Result` over a list), and immutable `Map`/`Set` update helpers. "Second caller before you extract" avoids a premature grab-bag forming under a different name.

**Alternative considered — a dedicated helper package:** rejected as a bucket package by another name; it would also add a dependency edge to every kernel-tier package and re-raise the leaf question.

**Alternative considered — always inline, never share:** rejected only for the genuinely-recurring cases (a hand-rolled `assertDefined` copied into a dozen test files is its own smell); inline remains correct for one-offs.

### D3 — No `@canopy/graph` split is motivated by this work

The disable mass that looked like a "graph is too big" signal is concentrated in the two hot files (carved out) plus ordinary projection/session/ops code. None of it is a bounded-context seam. Any split remains owned by `canopy-jxw`, which evaluates the package graph on architectural grounds.

### D4 — Ratify the playbook default and record an ADR

Update `docs/research/2026-08-15-eliminating-eslint-disables-playbook.md` to state plain-functional as the ratified, unconditional default (remove the "adjust if Effect is chosen" hedge in its Hard Constraints and `no-return-void` recipe) and point recurring-helper cases at the leaf-homed helpers. Add a dated ADR entry to `docs/architecture/decisions.md` capturing D1–D3 and the D5 triggers.

### D5 — Named revisit triggers

The Effect-free-kernel decision is reopened only on evidence, via a new design change, when: kernel-tier code needs structured concurrency, cancellation, or typed dependency injection that plain-functional patterns cannot express cleanly; or the hand-rolled `Result` demonstrably diverges from adapter Effect error handling in a way that produces real bugs; or a future `@canopy/graph` split (owned by `jxw`) changes which package is the leaf and reopens the dependency-weight calculus.

## Risks / Trade-offs

- **[Two error idioms persist — `Result` in the kernel, `Effect` in the apps.]** → This seam already exists and is a boundary concern; the adapter is the natural translation point. Documented as an accepted trade-off, with divergence-causing-bugs as an explicit D5 revisit trigger.
- **[Hand-rolled helpers duplicate what Effect ships for free.]** → The helper set is intentionally tiny and homed in one place (the leaf); "second caller before extract" bounds it. If it ever grows past a handful, that is a signal to revisit D1/D2, not to quietly accumulate.
- **[Rewrites could smuggle behavior changes while "just removing a disable."]** → Out of scope here but bounded by the playbook: rewrites are behavior-preserving, gated by `bun test`/`typecheck`/`lint` green, and perf-based modules need perf tests (`canopy-v9o.1.3`/`.4`). This change only ratifies the toolkit.
- **[Some kernel loops resist a clean functional rewrite (early exit, index math, accumulator with I/O).]** → The playbook already routes these (`.find`/`.some`/`.every`, boundary `for...of`); genuinely-irreducible cases are the perf-carve-out (`.1.2`) or a single justified external-boundary disable, not a reason to adopt Effect.

## Adversarial review and mitigations

### Resource and performance overhead

- **Risk:** plain-functional rewrites (`reduce`/`map`/spread) can allocate more than the imperative `let`/`for`/in-place mutation they replace, regressing hot paths.
  - **Mitigation:** the two demonstrably hot files (`incremental-projection.ts`, `indexes.ts`) are explicitly excluded from mechanical rewrite and owned by the perf-carve-out design bead (`canopy-v9o.1.2`) with perf tests first. For the remaining ~95 kernel disables (projection setup, ops, event-bus wiring, history), allocation is not on a measured hot path; the perf-test policy (`canopy-v9o.1.4`) requires any module _deemed_ perf-based to carry perf/load tests before a rewrite lands. Net: no rewrite touches an unbenchmarked hot path.
- **Risk:** choosing Effect (Option A) would add a large runtime to the most-depended-on package, inflating every consumer's bundle and cold-start.
  - **Mitigation:** D1 rejects Option A precisely to avoid this; the leaf gains no new dependency.

### Failure modes and edge cases

- **Risk:** the decision is ambiguous at package boundaries — e.g. is `@canopy/api-adapter` "kernel-tier" or "app/adapter"? A wrong read sends a rewrite down the wrong idiom.
  - **Mitigation:** the spec enumerates the two tiers explicitly by package name. `api-adapter` and the four apps are app/adapter (Effect allowed); `graph`/`queries`/`settings`/`storage*` are kernel-tier (Effect-free). No package is unlisted.
- **Risk:** a rewrite hits a case the plain-functional recipes don't cover and an agent invents a new disable or widens `ignoreTypePattern` to "finish."
  - **Mitigation:** the playbook forbids both and instructs the agent to stop and leave a note on the bead; the ratchet guard (`.1.3`) mechanically blocks a net-new disable from landing.
- **Risk:** `Result`-returning folds over a list (a common kernel shape: validate each of N, short-circuit on first error) are awkward without a combinator, tempting a `try`/`throw` shortcut.
  - **Mitigation:** this is exactly the recurring case D2 homes in the leaf (a `Result`-aware `traverse`/fold), added on second use. Until then the inline pattern (reduce carrying a `Result`) is specified in the playbook.

### Security and isolation

- **Risk:** none directly — this change ships no code. The indirect risk is that a toolkit choice weakens a trust boundary (e.g. WASM capability validation in `plugin-validation.ts`, which is in the kernel and carries disables).
  - **Mitigation:** rewrites are behavior-preserving by mandate; `plugin-validation.ts`'s capability checks keep identical semantics. Staying Effect-free also keeps the leaf's dependency surface minimal, which is the more conservative supply-chain posture (consistent with this repo's `ignoreScripts` hardening) — adopting a large new transitive dependency tree in the kernel would be the higher-risk direction.

### Migration and backward compatibility

- **Risk:** the playbook currently hedges ("adjust if Effect is chosen"); leaving it stale would let an agent make the opposite choice.
  - **Mitigation:** D4 rewrites the hedge to an unconditional default as part of this change; the spec makes the updated playbook a requirement.
- **Risk:** pre-release status could be misread as license to break the kernel `Result` API for its own sake.
  - **Mitigation:** D1 keeps `Result<T, E>` exactly as-is; no signature changes, no consumer migration. There is nothing to migrate — that is the point of choosing B.
- **Risk:** the 22 rewrite beads unblock and could stampede in parallel, colliding in shared files.
  - **Mitigation:** beads are partitioned per (package × rule-category); the playbook's per-bead file/rule/count list keeps them disjoint. Kernel beads unblock only after this change closes; app/adapter beads were already independent.

## Migration Plan

This change is documentation-only; "migration" is the rollout of the decision, not a code deploy.

1. Merge this OpenSpec change after adversarial review (merge to `main` is the approval signal that gates task-bead work, per project convention).
2. In the same change PR: update the playbook (D4) and add the ADR entry (D4).
3. Close `canopy-v9o.1.1`; the 22 rewrite beads (`.5`–`.26`) unblock automatically via their dependency on it.
4. Archive the OpenSpec change (`/opsx:archive`) once merged.

**Rollback:** if a later trigger (D5) reopens the decision, supersede the ADR entry with a new dated entry and a new design change; no code rollback is needed because no code shipped here.

## Open Questions

- None blocking. The shared-helper set (D2) is deliberately discovered lazily ("second caller before extract"), so its exact membership is intentionally left to the rewrites rather than pre-specified here.
