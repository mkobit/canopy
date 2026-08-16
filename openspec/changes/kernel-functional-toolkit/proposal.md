## Why

The `eslint-disable` elimination epic (`canopy-v9o.1`) has 22 per-package rewrite beads blocked on one architectural decision: what functional toolkit the kernel is rewritten against.
`@canopy/graph` holds the largest disable mass (250 directives) yet is Effect-free by design — a dependency-light leaf with a hand-rolled `Result<T, E>`.
The apps and `@canopy/api-adapter` already use `effect`, so the choice is whether to unify on Effect down into the kernel or keep the kernel Effect-free.
This must be decided once, and recorded as a durable convention, before any kernel rewrite starts — otherwise 22 parallel rewrites (some parceled to remote Jules agents) would each re-litigate it and diverge.

## What Changes

- Adopt a project decision: **the kernel stays Effect-free.** `@canopy/graph`, `@canopy/queries`, `@canopy/settings`, and the `@canopy/storage*` adapters are rewritten with plain-functional patterns (`reduce`/`fold`, the existing `Result<T, E>`, `readonly` structural updates). `effect` remains confined to the app/adapter boundary (`@canopy/api-adapter`, `apps/{web,cli,daemon,clip-host}`) where it already lives as an outer runner.
- Decide the shared-helpers question: **no new grab-bag `@canopy/functional` package.** The handful of genuinely-recurring pure helpers (a test `assertDefined`, a `Result`-aware fold/`traverse`, immutable `Map`/`Set` update helpers) are homed in the leaf `@canopy/graph` — which every package already imports — behind named, domain-neutral exports, added only when a second caller actually appears.
- Record the `@canopy/graph` split evaluation: **no split is motivated by this work.** The disable mass is concentrated in the two perf-critical hot files (owned by `canopy-v9o.1.2`) plus ordinary projection/session/ops code; none of it argues for decomposing the leaf. Any split stays owned by the package-graph track (`canopy-jxw`).
- Update the elimination playbook (`docs/research/2026-08-15-eliminating-eslint-disables-playbook.md`) to state the plain-functional default is now the ratified default (removing the "if Effect is chosen, adjust" hedge) and to point recurring-helper cases at the leaf-homed helpers.
- Record the decision as a dated ADR entry in `docs/architecture/decisions.md`.

This change is **design/decision only** — it ratifies a direction and produces documentation. It does not itself rewrite any `eslint-disable` or add/modify runtime code; the per-package rewrites remain their own beads.

## Capabilities

### New Capabilities

- `kernel-functional-toolkit`: the standing policy governing which functional toolkit each package tier uses — kernel/adapter Effect-free with plain-functional patterns and the existing `Result<T, E>`, `effect` confined to the app/adapter boundary, shared pure helpers homed in the leaf rather than a bucket package, and the conditions under which this decision would be revisited.

### Modified Capabilities

<!-- None. No existing spec's requirements change; the perf-carve-out (canopy-v9o.1.2) and the ratchet guard (canopy-v9o.1.3) are separate changes. -->

## Impact

- **Docs:** new ADR entry in `docs/architecture/decisions.md`; playbook `docs/research/2026-08-15-eliminating-eslint-disables-playbook.md` updated to drop the Effect-conditional hedge.
- **Beads:** unblocks the 22 rewrite beads `canopy-v9o.1.5`–`.26` (each references the playbook); leaves `canopy-v9o.1.2` (perf carve-out) and `canopy-v9o.1.3` (ratchet guard) independent.
- **Dependencies:** confirms `effect` is NOT added to `@canopy/graph`, `@canopy/queries`, `@canopy/settings`, or any `@canopy/storage*` `package.json`; preserves the leaf invariant (AGENTS.md #1) that `canopy-jxw` is actively tightening.
- **No runtime/code change** in this change: no source rewrite, no new package, no `eslint.config.mjs` edit.
