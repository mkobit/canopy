## Context

Status: proposed; independent adversarial review completed with revisions; maintainer approval pending.
Design bead: `canopy-jxw.2`.
Related designs: `canopy-3xr` (capability derivation), `canopy-reh` (permission modeling).

The [package review](../../../docs/research/2026-08-15-package-graph-bounded-contexts-review.md) correctly identifies plugin execution as a separate concern from protocol adaptation.
The existing [host bindings](../../../packages/api-adapter/src/wasm/host-bindings.ts) nevertheless depend on shared query, mutation, and event handlers, not just transport-neutral kernel types.
The [error module](../../../packages/api-adapter/src/result-errors.ts) also mixes common errors with gRPC, GraphQL, and WIT conversions.
These are the seams this proposal must resolve.

The [bounded-context map](../../../docs/architecture/bounded-contexts.md) remains the authoritative description of the current package graph until implementation lands.
All links below describe the pre-extraction locations.

## Goals and non-goals

Goals:

- Browser plugin execution has no import or package dependency on `@canopy/api-adapter`
- Protocol adapters and plugins share one implementation of existing graph-access behavior
- The graph kernel remains an internal-dependency-free leaf with immutable public contracts and `Result` errors
- Existing WIT, GraphQL, Connect, IPC, rendering, and event-log behavior survives the extraction
- Each proposed implementation boundary has an owner and observable acceptance evidence

Non-goals:

- Redesigning authentication, capability semantics, graph validation, query algorithms, or event subscriptions
- Introducing a new dependency-injection framework or a package per transport
- Moving application-owned rendering UI, worker entrypoints, or guest plugin implementations into the host package
- Consolidating the two existing WIT contract families or implementing `canopy-3xr` before its own review
- Adding vault migrations, compatibility shims, or new third-party runtime dependencies

## Decisions

### 1. Extract shared graph access as well as plugin execution

`@canopy/graph-access` owns application operations over an existing graph/session: queries, mutations, and event access with their current tenant checks, limits, payload conversion, and error categories.
It depends on `@canopy/graph` and `@canopy/queries`.
It does not own graph projection, storage implementations, protocol servers, plugin execution, UI, or a second write path.

`@canopy/plugin-host` owns WIT host bindings, capability validation, sandbox execution, fuel/payload/reentrancy guards, termination helpers, and the existing WASM facade.
It depends on `@canopy/graph-access` and `@canopy/graph`.
It creates graph-access requests and invokes the shared handlers directly.

`@canopy/api-adapter` owns transport schemas, servers, protocol framing, and protocol-specific error translation.
It consumes `@canopy/graph-access` and retains its direct graph/query dependencies wherever its own source uses them.
Neither plugin-host nor graph-access imports api-adapter, including type-only imports.
Api-adapter does not depend on plugin-host merely to preserve its old barrel exports.

`apps/web` imports plugin execution from plugin-host and the shared context/error contracts it actually uses from graph-access.
It declares both direct dependencies when both are imported.
CLI, daemon, and clip-host retain api-adapter for IPC and add graph-access only for shared symbols they import directly.

Alternatives considered:

- Move `wasm/` while retaining an api-adapter dependency: rejected because the dependency on transports remains
- Inject callbacks from an api-adapter bridge: rejected because web must still import that bridge, or duplicate operation semantics
- Put shared operations in plugin-host: rejected because transport-only consumers would depend on plugin execution for ordinary graph reads and writes
- Move shared operations into graph or queries: rejected because the kernel does not own application access policy and queries does not own writes or subscriptions
- Expose an api-adapter subpath: useful for reducing module reachability, but leaves the package boundary and declared transport dependency unresolved

The extra package is justified by two existing consumers with the same access semantics.
Its scope is the concrete operation layer already present, not a general services or utilities container.

### 2. Split ownership without rewriting behavior

| Existing source                                 | Destination and treatment                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `api-context.ts`                                | Graph-access context and shared auth/query/stream limits                  |
| `api-payloads.ts`                               | Graph-access request/result and operation payload contracts               |
| `query-handlers.ts`                             | Graph-access, preserving filters, limits, traversal, and error behavior   |
| `mutation-handlers.ts`                          | Graph-access, preserving `GraphSession.commit` as the write path          |
| `event-stream-handlers.ts`                      | Graph-access, preserving replay, buffering, and disposal contracts        |
| Common portions of `result-errors.ts`           | Graph-access error categories, construction, and kernel-result conversion |
| gRPC and GraphQL portions of `result-errors.ts` | Api-adapter, with existing protocol values unchanged                      |
| WIT portions of `result-errors.ts`              | Plugin-host, with existing WIT codes unchanged                            |
| `wasm/` implementation and public facade        | Plugin-host                                                               |

Use `GraphAccessContext`, `GraphAccessError`, `GraphAccessRequest`, and `GraphAccessResponse` for the shared public concepts.
Rename the associated `createApiAdapterContext`, `createApiAdapterError`, and `createApiRequest` factories consistently.
Other API-prefixed shared types receive the corresponding graph-access prefix; operation-specific names such as `NodeQueryPayload` remain intact.
Update in-repository callers atomically and remove the moved exports from the old barrel rather than maintaining aliases.
Names and imports change; serialized payloads, category strings, and function behavior do not.

The WASM-only `wasmFuelLimit` moves out of shared context limits into plugin-host options.
The effective default remains `1_000_000n`, and explicit overrides retain their precedence.
Migrate every caller that supplies the context-level value and test default and override behavior before removing the old field.
At construction, translate the former context value into the host facade's default `fuelLimit` option; per-execution `optionsOverride.fuelLimit` still overrides that facade default.
For callers invoking the executor directly, pass the former context value as `options.fuelLimit` unless an explicit executor override already exists.
Verify the default total, migrated context total, and explicit override separately.
The per-import meter is a distinct control: retain `defaultFuelPerImport ?? 100n` and cover both its default and explicit override independently.
Other resource limits remain with the layer that enforces them.

The existing error-details shape contains legacy `Record<string, unknown>` usage.
The extracted public error contract uses `unknown` with narrowing at consumers, preserving serialized values while satisfying the project invariant.
This is a boundary typing repair, not permission to redesign the error taxonomy or rewrite unrelated handlers.

### 3. Preserve both WIT contract families

The inline [WIT specification](../../../packages/api-adapter/src/wasm/wit-spec.ts) and its baseline move to plugin-host together with the WIT-specific tests.
Keep their contents and exported constant stable during extraction.
Split compatibility tooling so GraphQL/Connect snapshots remain owned by api-adapter and the WIT snapshot is owned by plugin-host.
The root compatibility command still runs both checks.
Update both `tools/check-api-compatibility.ts` and `tools/lib/api-compatibility-checker.ts` to import inline WIT from plugin-host and resolve its baseline there.
GraphQL, Connect, and IPC baselines remain under api-adapter; preserve waiver and baseline-update behavior for each protocol.
Split the WIT assertions from `packages/api-adapter/tests/schema-baselines.test.ts` and `schema-consistency.test.ts` so api-adapter acquires no plugin-host dependency just for those tests.
Acceptance includes `bun tools/check-api-compatibility.ts --target wit` and `--target all`, with unchanged snapshots and all-category error mapping coverage under the appropriate owners.

The modular [browser WIT sources](../../../apps/web/wit/AGENTS.md), browser code generation, guest artifacts, and worker entrypoints remain application-owned.
They serve role-specific component worlds and are not interchangeable with the inline graph API WIT string.
Do not silently replace one contract with the other or regenerate a baseline to hide a change.

### 4. Define a safe route to a single capability source

Extraction moves `WasmCapability`, `KNOWN_WASM_CAPABILITIES`, and the existing vocabulary-sync test to plugin-host.
The graph-side `RECOGNIZED_WASM_CAPABILITIES` remains where manifest validation currently uses it.
The sync test continues checking exact equality until `canopy-3xr` replaces the duplication.
Moving the host does not by itself complete that bead.

The follow-on design must use one build-time source owned with the plugin interface contract, emit a dependency-free vocabulary artifact for graph, and have plugin-host consume that graph export.
Graph must never import the host package or read its files at runtime or during its package build.
Generation runs as an explicit repository tool, with checked-in deterministic output and a check mode that rejects drift.
This permits a clean graph build without first building plugin-host and avoids a build-time dependency cycle.

That design must map actual callable host imports to capabilities, including the many-to-one mapping of `subscribeEvents` and `replayEvents` to `read:events`.
The existing bead's “1:1” wording must not force invented capability strings or an ABI change.
The source must also describe UI-only capabilities (`wizard`, `render:*`) and wildcard tokens separately from host-import grants.
Unknown operations or unmapped capabilities must fail the generation check; wildcard interpretation and the explicit `render:interactive` rule remain unchanged.
Whether the source is annotated WIT plus metadata or an interface manifest is a decision for `canopy-3xr`; extraction fixes ownership and required guarantees, not that representation.

### 5. Keep transport splitting out of this change

Connect, GraphQL, and IPC remain within api-adapter for this extraction.
They consume the same operation layer, and no identified consumer currently needs a separate package per protocol to satisfy the browser isolation goal.
REST-style operation payloads do not establish a fourth independently deployable server.
Revisit protocol packaging when a concrete consumer needs independent publication, dependency installation, or runtime loading.

## Adversarial review and mitigations

The following risks are approval criteria, not claims that extraction improves existing security or performance behavior.
Existing limitations remain visible rather than being certified by a successful file move.

Independent review found and reproduced an existing executor token bypass: `executeSandboxedGuestPlugin` does not pass its execution token as `boundToken` when creating bindings.
A guest launched with `read:nodes` can therefore pass `*` to a mutation import in the local execution path.
The direct binding test and main-thread worker dispatcher already bind authority; neither proves that the executor does so.
Fix and merge `canopy-fwe` separately before extraction implementation, with executor/facade denial and no-write regression tests.
The extraction's preservation baseline is that fixed revision, not the vulnerable executor; local promise timeouts still do not constitute hard termination of synchronous guest code.

| Risk                                                                                    | Concrete mitigation and evidence                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extra packages increase build configuration and declaration overhead                    | Add only two packages with existing runtime dependencies; update root/project references, manifests, lockfile, and both web path maps together; run a clean build before lint/typecheck |
| A shared error barrel accidentally imports gRPC or WIT back into graph-access           | Split error translation by owner; add a production import-boundary check rejecting forbidden edges, including type imports and deep imports                                             |
| Browser builds still reach GraphQL or IPC through a stale import                        | Remove web's api-adapter dependency and aliases; inspect main and worker build module graphs for api-adapter/GraphQL/IPC reachability, alongside the source boundary check              |
| A package-count improvement is mistaken for a bundle-size improvement                   | Compare emitted main/worker assets before and after on the same checkout/toolchain; report evidence without promising a size reduction from tree-shaking alone                          |
| Shared operations drift during movement or tenant checks are bypassed                   | Move handlers once; retain tenant denial, current-session reads, write-without-session rejection, replay limits, and protocol conformance tests against that implementation             |
| Removing context-level WASM fuel limits changes effective policy                        | Enumerate callers; preserve explicit override precedence and defaults in plugin options; assert both paths in host execution tests                                                      |
| A guest-supplied token replaces the load-time token                                     | Preserve `boundToken` and manifest/token capability intersection; retain a negative test with a forged guest token                                                                      |
| Worker dispatch becomes a trusted shortcut around capability checks                     | Preserve both worker-side checks and main-thread validation against the live graph; retain denial and token-change tests across dispatch                                                |
| Termination or cleanup regresses during import changes                                  | Preserve worker termination, memory maximum, nested-worker hardening, listener disposal, and existing runaway-guest tests; run real browser worker tests, not only Bun stubs            |
| Capability move changes UI privileges                                                   | Preserve exact vocabulary and wildcard behavior; retain explicit non-wildcard `render:interactive` coverage and render-tier tests                                                       |
| WIT baselines are conflated with modular browser worlds                                 | Move each baseline with its owner, require byte-identical snapshots, and exercise browser codegen separately                                                                            |
| Source aliases conceal broken package exports                                           | Exercise built package entrypoints in addition to existing source-based Bun tests; keep `tsconfig.json` and `tsconfig.check.json` mappings aligned                                      |
| A partial rollout breaks imports in another app                                         | Land the production extraction and consumer import cutover as one integration unit; run CLI/daemon/clip-host tests as well as web tests                                                 |
| Vocabulary codegen creates a dependency cycle or broadens grants                        | Defer implementation to reviewed `canopy-3xr`; require committed leaf-local output, exact operation coverage, and unchanged wildcard semantics                                          |
| The new layer becomes a general-purpose bucket                                          | Limit its exports to existing graph-access operations and their contracts; reject plugin runners, transport servers, storage implementations, and unrelated helpers during review       |
| Existing event-subscription and traversal limitations are silently “fixed” by delegates | Preserve behavior and tests during extraction; report discovered defects separately with reproductions and their own design disposition                                                 |

The source-boundary gate must inspect production imports rather than only compare manifests against the documented graph.
Extend the existing dependency tooling with a deterministic import check that resolves TS aliases and relative paths, rejects normal/type-only/deep/dynamic imports across the forbidden boundaries, and includes allowed and forbidden fixture tests.
Wire this into the normal quality gate; do not rely on the current manifest-parity checker to enforce source boundaries.

Browser evidence must be reproducible: build main and worker production entrypoints with sourcemaps or emitted-module metadata, then assert that both source lists exclude api-adapter, GraphQL, Connect, and IPC modules.
The evidence must include the worker build, not only the main Vite output, and must use the same resolution configuration as the shipped build.
Existing unit tests do not establish the complete live-worker authority boundary; add missing denied-dispatch coverage rather than describing it as already present.

Review record: Terra independently challenged the boundary and identified six required revisions: executor authority precondition, source import enforcement, WIT tooling ownership, fuel migration, reproducible browser evidence, and coupled integration ownership.
Each mitigation is incorporated above or in the delivery section; Terra re-reviewed the revised proposal and approved the mitigations with no remaining design blocker.
The maintainer's merged design PR is the approval signal for implementation staging.

## Migration and delivery boundaries

These are proposed integration boundaries, not staged tasks or permission to implement before approval.

First establish the shared graph-access contracts and error split, then move host code and update all production consumers in the same integration branch.
Because exports and package dependencies change together, these steps are sequential and must not be published as independently broken intermediate PRs.
The integration owner owns manifests, lockfile, TS references, barrels, shared contracts and errors, compatibility tooling, consumer imports, and the bounded-context map until the integrated build and typecheck pass.

After the integration owner supplies that passing commit, host regression-test relocation and protocol conformance verification can run independently with disjoint file ownership.
A separate reviewer verifies the forbidden dependency edges and browser worker behavior against built artifacts.
Luna is suitable for bounded import inventories and test relocation once mappings are fixed; Terra or another implementation agent is suitable for the coupled extraction and full build/lint/test repair cycle.
The design owner resolves boundary changes and reviews the integrated result before publication.

Each later implementation bead must include exact owned files, prerequisite contract/commit, unchanged behavior, negative cases, validation commands, and a stop condition for architectural ambiguity.
Delegates must not expand the extraction into query, permission, or rendering redesigns.

The accepted baseline is the existing API compatibility suite, host capability/sandbox tests, worker rendering tests, and renderer benchmarks.
Implementation must run `mise run check`, API compatibility checks, the relevant browser integration tests, and `apps/web` worker/render benchmarks using their existing commands.
The design-only PR runs OpenSpec strict validation and Markdown formatting checks.

No persisted data or guest ABI migration is required.
The workspace packages are private and are updated together.
Rollback is a revert of the integrated extraction, restoring the prior package imports and workspace configuration without rewriting any event log.

## Open questions and approval decisions

Approve or reject the additional graph-access boundary based on the shared-handler evidence above.
Approve keeping protocol packages combined and leaving capability-source representation to `canopy-3xr`.
After approval, create `tasks.md` and implementation beads from these delivery boundaries with a dependency graph that prevents premature work.
