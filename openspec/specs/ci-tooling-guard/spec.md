# ci-tooling-guard Specification

## Purpose
TBD - created by archiving change codify-ci-tooling-guard. Update Purpose after archive.
## Requirements
### Requirement: CI workflow Bun-version pins are consistent with the toolchain source

The guard SHALL scan every `.github/workflows/*.yml` file for a Bun-version pin — an `oven-sh/setup-bun` step's `bun-version` input, whether given as a literal or resolved from a workflow `env:` variable — and fail when any resolved pin differs from `mise.toml`'s `tools.bun` version, so no CI workflow can silently pin a Bun version other than the single toolchain source. A workflow that installs Bun via `jdx/mise-action` and declares no separate pin SHALL be treated as compliant.

#### Scenario: A workflow pins a Bun version that drifts from mise.toml

- **WHEN** a `.github/workflows/*.yml` file pins a concrete Bun version (directly on `bun-version`, or via an `env` variable it references) that does not equal `mise.toml`'s `tools.bun`
- **THEN** `bun run lint` fails and names the offending workflow file, the pinned version, and the expected `mise.toml` version

#### Scenario: A workflow installs Bun via mise with no separate pin

- **WHEN** a `.github/workflows/*.yml` file installs Bun through `jdx/mise-action` and declares no `bun-version` pin or Bun-version env variable
- **THEN** the version-consistency check passes for that file, because `mise.toml` is the sole source

#### Scenario: A workflow's Bun pin matches mise.toml

- **WHEN** a workflow's resolved Bun-version pin equals `mise.toml`'s `tools.bun`
- **THEN** the version-consistency check passes for that file

#### Scenario: A newly added workflow introduces a drifted pin

- **WHEN** a new `.github/workflows/*.yml` file is added that pins a Bun version differing from `mise.toml`
- **THEN** `bun run lint` fails for that file without any change to the guard, because the guard scans all workflow files rather than a hardcoded list

#### Scenario: A found pin cannot be resolved to a concrete version

- **WHEN** a workflow declares a `bun-version` input whose value the guard cannot resolve to a concrete version string (for example an unresolvable `${{ env.* }}` reference)
- **THEN** the guard fails with a clear message rather than silently passing, so an unparseable pin cannot bypass the check

### Requirement: No generated plugin-output artifact is tracked by git

The guard SHALL fail when `git ls-files` reports any tracked path matching the generated plugin-output globs (`**/guest.js`, `**/plugin.wasm`, `**/transpiled/**`, `**/plugin-node.json`, `apps/web/src/plugin/types/**`), so a WASM/codegen output cannot be committed even if a future path is not yet listed in `.gitignore`.

#### Scenario: A generated artifact is staged and tracked

- **WHEN** a tracked file matches one of the generated plugin-output globs
- **THEN** `bun run lint` fails and names the offending tracked path

#### Scenario: No generated artifact is tracked

- **WHEN** no tracked file matches any generated plugin-output glob
- **THEN** the artifact-hygiene check passes

### Requirement: The guard is deterministic and wired into lint

The guard SHALL run as part of `bun run lint` via a single typed script `tools/check-ci-tooling.ts`, deriving the toolchain version from `mise.toml` and the tracked-file set from `git ls-files`, so the check is reproducible and cannot be skipped in the normal lint path.

#### Scenario: Guard participates in the lint pipeline

- **WHEN** a contributor runs `bun run lint`
- **THEN** the CI-tooling guard executes and its failure fails the overall lint command

#### Scenario: The mise.toml Bun source is missing

- **WHEN** `mise.toml` has no `tools.bun` entry the guard can parse
- **THEN** the guard fails with a clear message, because it has no authoritative version to compare workflow pins against

