## ADDED Requirements

### Requirement: The kernel package is enforced as the dependency leaf

The lint pipeline SHALL derive the internal `@canopy/*` dependency graph from every workspace `package.json` and fail when `@canopy/graph` declares any `@canopy/*` entry in either `dependencies` or `devDependencies`, so architectural invariant #1 (the kernel is the leaf) is enforced structurally rather than by review.

#### Scenario: Kernel gains a runtime internal dependency

- **WHEN** `packages/graph/package.json` lists any `@canopy/*` package under `dependencies`
- **THEN** `bun run lint` fails and names the offending dependency

#### Scenario: Kernel gains a dev-only internal dependency

- **WHEN** `packages/graph/package.json` lists any `@canopy/*` package under `devDependencies` (for example a storage adapter pulled in only by a test)
- **THEN** `bun run lint` fails and names the offending devDependency, because a dev-only edge still violates the leaf invariant

#### Scenario: Kernel has no internal dependencies

- **WHEN** `packages/graph/package.json` declares no `@canopy/*` entry in `dependencies` or `devDependencies`
- **THEN** the leaf check passes

### Requirement: The internal package graph is acyclic including dev dependencies

The guard SHALL build the internal dependency graph from the union of `dependencies` and `devDependencies` across all workspaces and fail when any cycle exists, so a cycle introduced solely through a test-time edge (the F2 failure mode) is caught.

#### Scenario: A dev dependency closes a cycle

- **WHEN** a workspace adds a `@canopy/*` entry under `devDependencies` that, combined with existing runtime edges, forms a directed cycle
- **THEN** `bun run lint` fails and reports the packages that make up the cycle

#### Scenario: Graph is acyclic

- **WHEN** the union of runtime and dev internal edges contains no directed cycle
- **THEN** the cycle check passes

### Requirement: The documented dependency graph matches the real runtime graph

The guard SHALL compare the mermaid dependency-graph edges documented in `docs/architecture/bounded-contexts.md` against the real runtime edges derived from each workspace's `dependencies`, and fail on any difference, so the hand-maintained diagram cannot drift from reality (the F1 failure mode). The comparison SHALL use runtime `dependencies` only; dev-only edges are excluded because the documented graph describes runtime topology.

#### Scenario: A runtime dependency is undocumented

- **WHEN** a workspace declares a `@canopy/*` runtime dependency for which no corresponding edge exists in the mermaid block
- **THEN** `bun run lint` fails and names the missing documented edge

#### Scenario: A documented edge does not exist

- **WHEN** the mermaid block contains an edge for which no matching runtime `@canopy/*` dependency exists
- **THEN** `bun run lint` fails and names the stale documented edge

#### Scenario: A workspace is undocumented

- **WHEN** a `packages/*` or `apps/*` workspace has no node in the mermaid dependency-graph block
- **THEN** `bun run lint` fails and names the missing node

#### Scenario: Dev-only edge is not treated as documentation drift

- **WHEN** a workspace declares a `@canopy/*` package under `devDependencies` only, with no matching mermaid edge
- **THEN** the documentation-drift check does not fail, because runtime topology is what the diagram documents

#### Scenario: Documentation and reality agree

- **WHEN** the set of runtime `@canopy/*` edges equals the set of mermaid edges and every product workspace has a node
- **THEN** the documentation-drift check passes

### Requirement: Graph derivation is deterministic and wired into lint

The guard SHALL run as part of `bun run lint` via a single typed script `tools/check-dependency-graph.ts`, deriving nodes from git-tracked `packages/*` and `apps/*` workspace manifests, so the check is reproducible and cannot be skipped in the normal lint path.

#### Scenario: Guard participates in the lint pipeline

- **WHEN** a contributor runs `bun run lint`
- **THEN** the dependency-graph guard executes and its failure fails the overall lint command

#### Scenario: Node identity is resolved across naming conventions

- **WHEN** the mermaid labels an app by its workspace path (for example `apps/web`) while its manifest name is `@canopy/web`
- **THEN** the guard resolves both forms to the same workspace so the edge comparison is not confused by label style
