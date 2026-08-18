## 1. Remediate the live drift (measure-before-gating: green baseline first)

- [x] 1.1 Convert `.github/workflows/openspec.yml`'s Bun install step from `oven-sh/setup-bun@v2` + `env.BUN_VERSION` to `jdx/mise-action`, matching `ci.yml`/`beads-validation.yml`/`beads-upgrade-check.yml` (Decision 5, mise-action path — approved)
- [x] 1.2 Remove the now-unused `env.BUN_VERSION: '1.3.12'` block
- [x] 1.3 Confirm the `openspec` job still passes locally/in CI with the mise-based install (`bunx openspec validate --all` still resolves)

## 2. Implement `tools/check-ci-tooling.ts`

- [x] 2.1 Version-consistency half: glob `.github/workflows/*.yml`; for each, detect an `oven-sh/setup-bun` step's `bun-version` input (literal, or resolved from the workflow's top-level `env:` map per Decision 3); compare each resolved concrete pin against `mise.toml`'s `tools.bun` (reuse the anchored regex from `tools/verify-versions.ts`); a file with no pin (mise-action only) passes; a floating pin (`latest`/`canary`) is not compared; an unresolvable pin fails closed with a message naming the file (Decision 3)
- [x] 2.2 Artifact-hygiene half: run `git ls-files`, fail if any tracked path matches the generated-artifact globs (`**/guest.js`, `**/plugin.wasm`, `**/transpiled/**`, `**/plugin-node.json`, `apps/web/src/plugin/types/**`), each glob commented with its emitting codegen stage (Decision 4)
- [x] 2.3 Fail (`process.exit(1)`) with a message naming the offending file/path and, for the version check, the pinned vs. expected version; exit 0 with a short status line when both halves are clean
- [x] 2.4 Add a unit test pinning the guard's parsing/comparison logic on small fixtures (mirrors `tools/check-eslint-disable-ceiling.test.ts`) — cover: mise-action-only file (pass), matching literal pin (pass), drifted literal pin (fail), `env`-indirected pin (resolved + compared), unresolvable pin (fail closed), tracked generated-artifact path (fail), clean tree (pass)
- [x] 2.5 **Scope discovery**: `tools/package.json` had no `scripts.test`, so `bun run test` (`bun --filter '*' test`) silently skipped the entire `tools/` workspace in CI — the two pre-existing guard tests (`check-eslint-disable-ceiling.test.ts`, `check-dependency-graph.test.ts`) and this change's new test never actually ran in CI, only when invoked manually. Added `"test": "bun test ."` to `tools/package.json` so `bun run test` picks up all `tools/*.test.ts` (verified: 79 pass across 7 files under `bun --filter '*' test -- --coverage --coverage-reporter=lcov`, matching CI's exact invocation)

## 3. Wire into lint

- [x] 3.1 Add a `check:ci-tooling` script to `package.json` invoking `bun tools/check-ci-tooling.ts`
- [x] 3.2 Add it to the `lint` chain after the existing `tools/*.ts` guards (alongside `check:versions`, `check-eslint-disable-ceiling`, the dependency-graph guard)

## 4. Validate and land

- [x] 4.1 Run `bunx openspec validate codify-ci-tooling-guard --strict`
- [x] 4.2 Run full `bun run build && bun run lint && bun run typecheck && bun test`; confirm the guard passes at the remediated baseline (zero findings on both halves)
- [x] 4.3 Manually verify the version check fails: temporarily drift a workflow's Bun pin (or `mise.toml`), run the guard, confirm non-zero exit and a message naming the file and versions; revert
- [x] 4.4 Manually verify the artifact-hygiene check fails: `git add -f` a throwaway file matching a generated-artifact glob, run the guard, confirm non-zero exit; `git reset` and remove the throwaway file
