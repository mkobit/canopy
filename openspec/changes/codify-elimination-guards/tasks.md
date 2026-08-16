## 1. Guard 1 — unused-directive rejection (free win first)

- [ ] 1.1 Add `linterOptions: { reportUnusedDisableDirectives: 'error' }` config object to `eslint.config.mjs` applying to all files
- [ ] 1.2 Dry-run `bun run build && bun run lint` against current `main`; capture any now-unused directives surfaced
- [ ] 1.3 Remove each unused directive (delete the comment, or the code it guarded if that too is dead); re-run lint until clean

## 2. Guard 1 — count-ceiling check

- [ ] 2.1 Write `tools/check-eslint-disable-ceiling.ts`: scan git-tracked `*.ts`/`*.tsx`/`*.mjs` under `packages`/`apps`/`tools` + `eslint.config.mjs`, anchored pattern `^\s*(//|/\*)\s*eslint-disable`, applying the documented exclusion list (dist, transpiled, node_modules, `*.d.ts`, guest.ts, mock, draft-session-shim, ignored `scripts/` dirs)
- [ ] 2.2 Read baseline from `tools/eslint-disable-baseline.json` (`{ "ceiling": N }`); fail (exit 1) when `count > ceiling` with a message naming count, ceiling, and remedy; print a non-fatal nudge when `count < ceiling`
- [ ] 2.3 Add `--update` mode that rewrites the baseline file to the current count
- [ ] 2.4 Measure the post-cleanup count via the new counter and commit it as the initial `tools/eslint-disable-baseline.json`
- [ ] 2.5 Wire `bun tools/check-eslint-disable-ceiling.ts` into the `lint` script in `package.json`
- [ ] 2.6 Add a unit test pinning the counter's output on a small fixture (guards against regex/scope drift)

## 3. Guard 2 — perf-test policy

- [ ] 3.1 Add a perf-test-policy section to `AGENTS.md`: modules deemed perf-based must carry a perf/load test; a change touching one must not land without that test green
- [ ] 3.2 Add a perf-based-module inventory table to `AGENTS.md`: `indexes.ts` (covered by `bench-index-maintenance.ts`), `incremental-projection.ts` (gap)
- [ ] 3.3 Confirm whether `canopy-v9o.1.2` commits to a projection perf test; if not, file a bead for the `incremental-projection.ts` benchmark gap and link it in the inventory

## 4. Validate and land

- [ ] 4.1 Run `bunx openspec validate codify-elimination-guards --strict`
- [ ] 4.2 Run full `bun run build && bun run lint && bun run typecheck && bun test`; confirm the ceiling check passes at the committed baseline
- [ ] 4.3 Manually verify the ceiling fails: add a throwaway `eslint-disable` above baseline, run lint, confirm non-zero exit and message; revert
- [ ] 4.4 Manually verify unused-directive rejection: add a directive that suppresses nothing, confirm lint errors; revert
