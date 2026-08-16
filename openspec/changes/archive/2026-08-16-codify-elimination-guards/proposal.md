## Why

The `eslint-disable` elimination epic (`canopy-v9o.1`) is about to rewrite ~578 directives across the codebase, but nothing stops a merged rewrite from being silently undone by a new disable, and nothing stops a "perf-sensitive" module from being rewritten blind (no benchmark to catch a regression).
Without durable guards, the elimination is a one-time cleanup that decays; with them it becomes a ratchet that only tightens.

## What Changes

- Enable `linterOptions.reportUnusedDisableDirectives: 'error'` in `eslint.config.mjs` so a directive that suppresses nothing fails lint — a free, immediate win that also keeps rewrites honest (a stale disable left behind after a rewrite is caught).
- Add a deterministic **count-ceiling check** to `bun run lint`: total anchored `eslint-disable` directives in linted source may only stay equal to or below a committed baseline. A newly added disable fails CI unless the baseline is explicitly lowered. Every rewrite bead lowers the ceiling; no new escape hatch slips in.
- Commit the baseline count as a checked-in artifact (single source of truth) alongside the counter script.
- Codify a **perf-test policy** in `AGENTS.md`: a module deemed perf-based must carry at least one perf/load test, and a change touching it may not land without that test green. Record an inventory of current perf-based modules and their benchmark status; file beads for the gaps.

## Capabilities

### New Capabilities

- `eslint-disable-ratchet`: unused-directive rejection plus a monotonic-decreasing count-ceiling on `eslint-disable` directives, enforced in `bun run lint` against a committed baseline.
- `perf-test-policy`: the standing rule that perf-based modules must carry perf/load tests, with a maintained inventory of which modules are in scope.

### Modified Capabilities

<!-- None. eslint-functional-enforcement defines the functional rules themselves; this change adds a separable directive-lifecycle mechanism on top, not a change to those rule requirements. -->

## Impact

- `eslint.config.mjs` — new `linterOptions` block; possible cleanup of any currently-unused directives surfaced by the flip to `error`.
- `package.json` `lint` script + `tools/` — new counter script wired into the lint chain; new committed baseline file.
- `AGENTS.md` — new perf-test-policy section and perf-based-module inventory.
- Contributors and CI: a new failure mode (adding a disable, or leaving a stale one) with a documented, one-line remedy (rewrite the code, or explicitly lower the baseline).
- Beads: gap beads filed for perf-based modules lacking benchmarks.
