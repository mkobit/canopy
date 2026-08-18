## Context

The packaging/dev-tooling review (`docs/research/2026-08-15-packaging-build-dev-tooling-review.md`, track `canopy-08x` of the whole-system review epic `canopy-v9o`) found two hygiene invariants held only by convention:

- **F1** — a CI workflow can pin a Bun version independent of `mise.toml` (the single toolchain source), and nothing checks it. `tools/verify-versions.ts` (already in `bun run lint`) asserts `package.json engines.bun ↔ mise.toml` and workspace dependency uniformity, but never reads a workflow file. F1's original instance — the dead `bun-version` matrix axis in `ci.yml` — was removed in PR #493 (`canopy-08x.1`); `ci.yml` and `beads-validation.yml` now install Bun purely via `jdx/mise-action`.
- **F6** — every WASM/codegen output (`guest.js`, `plugin.wasm`, `transpiled/`, `plugin-node.json`, `src/plugin/types/`) is `.gitignore`d and untracked, but nothing fails if a future commit stages one. The risk is regression, not current state.

The review's C1 codification target is a single lint-wired guard (`tools/check-ci-tooling.ts`) closing both. This is a CI-gating check, so per `feedback_measure_before_gating_ci_checks` it was dry-run against `main` before being specced.

**Scope-widening discovery beyond F1's original framing.** F1 named only `ci.yml`. Investigation found a _second, still-live_ Bun-version source F1 did not anticipate: `.github/workflows/openspec.yml` sets `env.BUN_VERSION: '1.3.12'` and feeds it to `oven-sh/setup-bun@v2`'s `bun-version` input — a completely separate install path from the mise-based one. `mise.toml` pins `bun = "1.3.14"`. A guard that hardcoded the F1 filenames (`ci.yml`, `beads-validation.yml`) would report clean and miss this. The guard therefore scans _every_ `.github/workflows/*.yml` for any Bun-version pin, not a fixed filename list (Decision 1).

**Dry-run result (against `main`, this change's investigation).**

Version-consistency half — `mise.toml` pins `bun = "1.3.14"`; scanning all four workflow files for a Bun-version pin (`rg -n -i 'bun-version|BUN_VERSION|setup-bun|mise-action' .github/workflows/`):

```
ci.yml                    → jdx/mise-action, no bun-version pin        → OK (mise is sole source)
beads-validation.yml      → jdx/mise-action, no bun-version pin        → OK
beads-upgrade-check.yml   → jdx/mise-action, no bun-version pin        → OK
openspec.yml              → env.BUN_VERSION: '1.3.12' → oven-sh/setup-bun bun-version
                            → FAIL: pins 1.3.12, mise.toml expects 1.3.14
```

The guard would report exactly **one** failure — `openspec.yml`'s `1.3.12` vs `mise.toml`'s `1.3.14` — and nothing else. This is not a false-positive alarm the measure-first rule exists to catch; it is a **true positive** — a real, current drift that is exactly the class of bug the guard exists to prevent. The measure-first requirement is satisfied by remediating this one drift as part of the change (align `openspec.yml`, preferably by converting it to `jdx/mise-action`) so the check is green at gate-time.

Artifact-hygiene half — `git ls-files | rg 'guest\.js$|plugin\.wasm$|/transpiled/|plugin-node\.json$|src/plugin/types/'`:

```
(no output)
```

Clean, as F6 reported — no tracked generated artifact. The guard passes this half on `main` today; it exists to catch a future regression.

## Goals / Non-Goals

**Goals:**

- Fail `bun run lint` when any `.github/workflows/*.yml` pins a Bun version that drifts from `mise.toml`'s `tools.bun`, scanning all workflow files generically (no hardcoded filename list).
- Fail `bun run lint` when any `.gitignore`d generated plugin-output path is tracked by git.
- Keep the check deterministic, dependency-free, and sub-second — consistent with the existing `tools/*.ts` guards.
- Remediate the live `openspec.yml` drift so the guard is green when wired to fail.

**Non-Goals:**

- Changing `tools/verify-versions.ts`'s scope (it keeps `package.json engines.bun ↔ mise.toml` and workspace dependency uniformity).
- Asserting CI _step order_ matches the `mise` `check` task (F4) — that is a separate potential change, out of scope here.
- Validating non-Bun tool versions in workflows (e.g. the `mise-action` version, action SHAs) — a Bun-version + artifact-hygiene guard only.
- Auto-fixing a drifted pin or an errantly-tracked artifact — the guard reports; the fix is manual.

## Decisions

### Decision 1: generic workflow scan, not a hardcoded filename list

The version-consistency half globs every `.github/workflows/*.yml` and, for each, detects a Bun-version pin (a `oven-sh/setup-bun` step's `bun-version` input — literal, or resolved from the workflow's `env:` block when written as `${{ env.FOO }}`). A file that installs Bun via `jdx/mise-action` with no separate pin asserts nothing (mise is the sole source, correct by construction).

- **Why**: the real drift lives in `openspec.yml`, which F1 never named. Hardcoding `ci.yml`/`beads-validation.yml` (both already mise-only, both clean) would pass while missing the actual bug, and would also miss any _future_ workflow that pins Bun independently. A generic scan is a simpler rule (one predicate: "any workflow pin must equal mise") that catches the live bug and all future instances, with no obvious downside — the set of workflow files is tiny.
- **Alternative considered**: extend the F1 fix's narrow scope to a two-filename allowlist — rejected; it encodes the exact blind spot that let `openspec.yml` drift, and needs editing every time a workflow is added.

### Decision 2: a new `tools/check-ci-tooling.ts`, not an extension of `verify-versions.ts`

The two concerns land in a new script rather than folded into `verify-versions.ts`.

- **Why**: cohesion by concern. `verify-versions.ts` parses two known manifest files (`package.json`, `mise.toml`) for _package-manifest_ version consistency. The new guard has a different shape on both axes: it _globs a directory_ of workflow YAML and _shells out to `git ls-files`_ for an index-hygiene check that has nothing to do with versions. Merging them would give `verify-versions.ts` three unrelated responsibilities and a git subprocess it currently avoids. Two small, single-purpose guards read better and fail with clearer provenance.
- **Deliverable alignment**: the bead `canopy-08x.4` and the review's C1 name `tools/check-ci-tooling.ts` explicitly as the artifact; a new script matches that contract.
- **Shared parse**: both scripts parse `mise.toml`'s `tools.bun` with the same anchored regex already proven in `verify-versions.ts` (`/^bun\s*=\s*["']?([^"'\n]+)["']?/m`); the new script reuses that pattern rather than importing across tool scripts, keeping each standalone (consistent with the existing `tools/*.ts` convention of self-contained Bun scripts).
- **Alternative considered**: the review's cheaper path — add only the CI-workflow assertion to `verify-versions.ts` and home the artifact-hygiene check elsewhere — rejected; it splits the two halves of one hygiene concern across two files and still needs a home for the git-index check, netting more surface than one cohesive guard.

### Decision 3: workflow parsing is line/regex-based and fails closed on an unresolvable pin

The guard locates `oven-sh/setup-bun` usages and their associated `bun-version:` value, resolving a `${{ env.FOO }}` value from the workflow's top-level `env:` map. It compares only concrete version strings. Floating values (`latest`, `canary`) are treated as intentional upstream-tracking and not compared. If a `bun-version` input is present but its value cannot be resolved to a concrete version (e.g. an unknown env reference or a non-trivial expression), the guard **fails with a clear message** rather than passing.

- **Why regex/line-based, not a YAML parser**: the repo adds dependencies deliberately, and no YAML parser is currently a dependency; workflow files are few and structurally simple. A targeted scan reusing the `verify-versions.ts` style keeps the guard dependency-free.
- **Why fail-closed**: a guard that silently passes on a pin it can't understand is a bypass. Failing closed on the (rare, reviewed) workflow-file surface is the safe direction; the message tells the author to make the pin a concrete literal or remove it in favour of mise. This is a deliberate trade toward a false-positive over a false-negative, acceptable because workflow files are hand-edited and reviewed.
- **Trade-off**: a future exotic workflow expression could trip the guard. Mitigation: the scan handles the two forms that exist today (literal and `env`-indirected) and the fail-closed message points at the fix; if a third form appears, the guard is a small script to extend.

### Decision 4: artifact-hygiene uses forward-looking globs, not `.gitignore`-derived paths

The hygiene half checks `git ls-files` output against an explicit, commented glob list (`**/guest.js`, `**/plugin.wasm`, `**/transpiled/**`, `**/plugin-node.json`, `apps/web/src/plugin/types/**`) rather than deriving patterns from `.gitignore`.

- **Why globs over `.gitignore` derivation**: `.gitignore` lists per-plugin-instance concrete paths (`apps/web/src/plugin/markdown/guest.js`, `.../mock/guest.js`, …). A guard keyed on those would miss a generated artifact committed to a _new_ plugin directory that no one added to `.gitignore` yet — exactly the regression the guard exists to prevent. Forward-looking globs catch generated output regardless of which plugin dir it lands in.
- **Provenance**: each glob is commented with the codegen stage that emits it (`jco` transpile, `Bun.build` guest bundle, `wit-codegen` types), so the list is auditable and updated when the pipeline changes.
- **Alternative considered**: parse `.gitignore` and reuse its entries — rejected; couples the guard to the current per-instance ignore entries and reintroduces the not-yet-ignored-path blind spot.

### Decision 5: remediate `openspec.yml` before wiring the check to fail

Sequencing in this change: (1) align `.github/workflows/openspec.yml`'s Bun source to `mise.toml` — preferred remediation is converting its `oven-sh/setup-bun` + `env.BUN_VERSION` step to `jdx/mise-action` (matching the other three workflows, collapsing to a single source and zero separate pin); fallback is bumping the literal `1.3.12` → `1.3.14`; (2) add `tools/check-ci-tooling.ts`; (3) wire `check:ci-tooling` into the `lint` chain.

- **Why**: the measure-before-gating rule requires a green baseline at gate-time. Fixing the one true-positive drift first means the guard passes on `main` the moment it is wired, so the wiring commit does not itself break lint.
- **Why prefer mise-action over bumping the literal**: converting `openspec.yml` removes the _second source_ entirely rather than re-synchronising it, so the same drift cannot recur; it also makes the guard's "no separate pin" compliant path the norm across all four workflows. The literal bump is a valid fallback if the mise-action conversion is undesirable for the `openspec` job (it currently uses `bunx openspec` and needs only Bun).

## Risks / Trade-offs

- **Workflow-pin false positive on an unparseable value** (Decision 3 fails closed) → mitigated: the scan covers the two pin forms present today (literal, `env`-indirected); the failure message names the file and asks for a concrete literal or mise-action; workflow files are few and reviewed, so a spurious failure is cheap to resolve.
- **Artifact-hygiene glob is too broad or too narrow** → too-narrow (a novel generated filename) is mitigated by keying globs to the generator stages and revisiting when the codegen pipeline changes; too-broad (a hand-authored file legitimately named `guest.js`) is mitigated because those names are reserved-by-convention for generated output and the glob can be narrowed if a real conflict appears (none exists today).
- **`git ls-files` requires a git repo** → `bun run lint` always runs inside the checkout; if git is unavailable the guard errors loudly (acceptable, same environment assumption as the beads and husky tooling).
- **Guard scope drifts from the real codegen outputs** (a future stage emits a new artifact type) → the glob list is small and commented with its emitting stage; a pipeline change is the natural trigger to extend it, same maintenance model as the `eslint-disable` exclusion list in `check-eslint-disable-ceiling.ts`.
- **Two scripts both parse `mise.toml` bun** (`verify-versions.ts` + this guard) → accepted duplication of a one-line regex keeps each `tools/*.ts` script standalone, consistent with the existing convention; the alternative (a shared import) couples the guards for negligible benefit.

## Migration Plan

1. Land in one PR: remediate `openspec.yml`, add `tools/check-ci-tooling.ts`, wire `check:ci-tooling` into the `package.json` `lint` chain (after the existing guards). Self-contained dev tooling; pre-release, no runtime/user impact.
2. Rollback = revert the `openspec.yml` edit, drop `check:ci-tooling` from the `lint` script, delete the script. No data or API surface touched.
3. Contributor-facing change: two new lint failure modes, each with a self-describing one-line remedy — align the workflow pin to `mise.toml` (or switch it to mise-action), or `git rm --cached` the errantly-tracked generated artifact.

## Adversarial review and mitigations

**Resource / performance overhead.**
The guard performs two cheap operations, run once per `bun run lint` (not per workspace): reading ~4 small workflow YAML files plus `mise.toml` (a few KB total), and a single `git ls-files` invocation (a read of the git index, already fast — the same command the review used to verify F6). No TypeScript program is loaded, unlike the eslint passes it sits beside, so there is no new heap pressure. Total added cost is sub-second and negligible against the existing per-workspace eslint programs (~seconds each). The `git ls-files` output scan is a linear string match over tracked paths.

**Edge cases / failure modes.**

- _Workflow with no Bun pin (mise-action path)_: asserts nothing — correct; `ci.yml`, `beads-validation.yml`, `beads-upgrade-check.yml` all take this path today and stay green.
- _`bun-version` indirected through `env`_: resolved from the workflow's top-level `env:` map (the exact form `openspec.yml` uses today); a literal `bun-version:` is compared directly.
- _Unresolvable pin value_: fails closed with a clear message (Decision 3) so an unparseable pin cannot bypass the check — a deliberate false-positive-over-false-negative trade on a small, reviewed surface.
- _Floating pins (`latest`/`canary`)_: not compared, treated as intentional upstream-tracking; documented so a reviewer knows they are allowed by design.
- _New workflow file with a drifted pin_: caught automatically because the scan globs all workflow files — this is the concrete reason for Decision 1's generic scan over F1's filename list.
- _`mise.toml` `tools.bun` missing or renamed_: the guard fails with a clear message (it has no authoritative version to compare against), mirroring how `verify-versions.ts` already handles a missing bun line.
- _Artifact-hygiene false negative_ (a generated artifact under a filename not in the glob list): mitigated by keying globs to the emitting codegen stages and revisiting on pipeline change; the list is small and commented.
- _Artifact-hygiene false positive_ (a hand-authored file matching a glob): those names are reserved-by-convention for generated output; none conflicts today, and the glob can be narrowed if one ever does.

**Security / isolation.**
Dev-tooling only — no runtime, network, or data-plane surface. The guard reads local files and runs one read-only `git ls-files` (no network, no writes, no new dependency; Bun built-in `fs` plus a git subprocess, consistent with the existing `tools/*.ts` guards and the beads tooling). The trust value is defensive: it closes a drift class where a CI file could silently install a different Bun than the pinned toolchain — masking a version-specific bug or running subtly different tooling than developers use locally — and prevents a generated (unreviewed, machine-emitted) artifact from being committed into the tracked tree. The fail-closed behaviour on an unresolvable pin removes the obvious bypass. No privileged execution is introduced.

**Migration / backward compatibility.**
The guard is additive; nothing consumes its output yet, so there is no compatibility surface to break. The one ordering constraint is the measure-before-gating requirement: the guard fails on `main` today because of the real `openspec.yml` drift, so Decision 5 sequences the remediation _before_ wiring the check to fail — the guard is green at gate-time, and the wiring commit does not itself break lint. Rollback is a clean revert of three edits (the `openspec.yml` alignment, the `lint`-script line, the new script). Pre-release status (`canopy-pre-release-no-real-users`) means no user data, vault, or published API is touched; the only downstream is contributor workflow, covered by the self-describing failure messages and this design.

## Open Questions

- Preferred `openspec.yml` remediation: convert to `jdx/mise-action` (removes the second Bun source entirely — recommended) versus bump the `1.3.12` literal to `1.3.14` (keeps the `oven-sh/setup-bun` step). Both make the guard green; resolve at implementation based on whether the `openspec` job wants the full mise toolchain or only Bun.
- Should the guard eventually also assert the `jdx/mise-action` version pin is uniform across workflows (all four currently use `v2026.5.1`)? Out of scope here; note if a drift appears, since it is the same class of CI-tool-version consistency the guard already embodies.
