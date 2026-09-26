## Context

Status: draft for collaborative review; not approved for implementation or task staging.
Tracking context: `canopy-ax6`, `canopy-nv5`, and `canopy-egu`.
Research base: `cc6835d3504eae9d34d27b85df1b88e6079826d9`.
Root owns synthesis and contract questions; research agents are read-only.
The [core tenets](../../../docs/architecture/core-tenets.md), [canonical data model](../../../docs/design/2026-02-06-core-data-model.md), and [current package map](../../../docs/architecture/bounded-contexts.md) govern interpretation.

The user-visible outcome is predictable presentation: a plugin declaration cannot authorize interactive execution, and the same graph renderer definition has one meaning across specifications.
This reconciles settled rules while keeping unsupported runtime cases visible.

## Evidence and status

| Contract                                                                                             | Evidence                                                                                                                                                                                                                                                                                                               | Classification                                                                           |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Explicit interactive authority selects Tier 2; wildcards alone do not                                | [Tier-2 decision 2](../archive/2026-08-15-tier2-sandboxed-render-engine/design.md), merged [PR #468](https://github.com/mkobit/canopy/pull/468) at `137deee85e2b52cbd9cd948fc27b94bd64fe81c3`, spec synchronization [PR #469](https://github.com/mkobit/canopy/pull/469) at `e999f6123974fa101d3dd82ccb1433a063f29061` | Approved; core routing gate implemented                                                  |
| View dispatch says declaration; content dispatch says effective grant                                | [View dispatch](../../specs/view-rendering/spec.md#requirement-component-registry-and-dynamic-dispatch), [render tier selection](../../specs/content-rendering-plugin/spec.md#requirement-render-tier-selection)                                                                                                       | Normative contradiction; correct toward approved history                                 |
| All execution capped at raw HTML                                                                     | [Execution scenario](../../specs/content-rendering-plugin/spec.md#scenario-execution-is-capability-scoped), [historical static design](../archive/2026-08-15-wasm-content-rendering/design.md)                                                                                                                         | Historical Tier-1 clause conflicts with approved Tier 2                                  |
| Renderer is a graph node type                                                                        | [Bootstrap](../../../packages/graph/src/bootstrap.ts), [identifiers](../../../packages/graph/src/system.ts), canonical model section 6                                                                                                                                                                                 | Implemented; no second RendererDefinition node type or current exported TypeScript shape |
| Host imports use bound authority                                                                     | [Host bindings](../../../packages/api-adapter/src/wasm/host-bindings.ts), [PR #538](https://github.com/mkobit/canopy/pull/538) at `1145aa7e5be6e71f6952e361d176aeb2a4b9f784`                                                                                                                                           | Implemented security prerequisite                                                        |
| Shared access and plugin execution have separate package owners                                      | [Extraction design and mitigations](../extract-plugin-host/design.md), [PR #537](https://github.com/mkobit/canopy/pull/537) at `aae5b524c61ac70d35f8e61c034c310113adc78a`                                                                                                                                              | Approved but unimplemented                                                               |
| Extraction plan is staged                                                                            | [PR #544](https://github.com/mkobit/canopy/pull/544) at the research base changes only `tasks.md`                                                                                                                                                                                                                      | Planning merged; implementation remains unclaimed                                        |
| General installation/grant lifecycle, arbitrary guest loading, graph-defined application composition | [Core tenets](../../../docs/architecture/core-tenets.md), [current grant registry](../../../apps/web/src/components/renderers/render-grants.ts)                                                                                                                                                                        | Exploratory or absent; harness hooks do not establish these product contracts            |

## Proposed reconciliation

### Renderer terminology

`Renderer` names the persisted graph node type whose instances describe a supported rendering implementation.
A `ViewDefinition` references a `Renderer` through `uses_renderer`.
For a WASM renderer, the application interprets its `entryPoint` as the referenced Plugin node identifier; native entries resolve through the application's registry.
`RendererDefinition` in historical rendering specifications describes that renderer definition, not an additional graph type.
`SYSTEM_IDS.RENDERER_DEF` identifies the NodeType definition named `Renderer`; renderer instances use `SYSTEM_IDS.RENDERER`.
No identifier, property, public export, or persisted data is renamed.
The `permissions` metadata field is not evidence of an enforced grant source.

### Declaration, grant, and execution

The manifest declares requested capabilities; host-controlled scope grants authority.
The existing intersection narrows execution authority, and an explicit non-wildcard interactive host grant is additionally required for Tier 2.
An intersection helper can expand a wildcard into a literal capability, so inspecting that resulting string alone is insufficient to prove an explicit host grant.
View dispatch will reference [render tier selection](../../specs/content-rendering-plugin/spec.md#requirement-render-tier-selection) rather than maintain a contradictory authorization rule.
The bundled Markdown renderer retains its static `render:raw-html` ceiling.
Output tier does not itself grant graph-read or graph-write authority; other host imports still require their existing manifest and bound host grants.
This correction adds no graph-read/write grants and defines no new permission storage, revocation, or installation mechanism.

Tier selection and executable availability are separate facts.
Current [dispatch](../../../apps/web/src/components/renderers/render-tier.ts) returns Tier 1 when a worker guest ID is absent, while [static execution](../../../apps/web/src/components/renderers/execute-wasm-render.ts) independently derives a token from the fixed system grant and always loads bundled Markdown.
Consequently, current fall-through is not proof that an alternate renderer is authorized.
The maintainer selected fail-closed behavior on 2026-09-20: if the authorized interactive renderer's worker guest cannot resolve or load, show a host-owned unavailable indication without alternate guest execution, Tier-1 downgrade, or mounting output from that failed render.
This is a selected design decision, not implemented behavior or approval to stage implementation.
It takes precedence over generic property fallback for this specific failure; exact wording and visual treatment remain application UX details.

## Contract and ownership matrix

The current map remains authoritative for implemented package locations.
Future owners below are approved by the extraction design, not created by this proposal.
Root is the integration/contract-change owner for this review; a future assignment needs its own named integration owner and independent reviewer.

| Context and purpose             | Provided and consumed contracts                                                                                                                                  | Owner now → approved owner                                          | Boundary and observable example                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph structure and persistence | Provides typed nodes, renderer/view/plugin bootstrap and manifest validation; provides `GraphSession` and `EventLogStore`                                        | `@canopy/graph` → unchanged                                         | Leaf with no host/transport imports; a definition exists without executing a plugin; writes retain the event-log path                                                                                                                               |
| Stored queries and views        | Consumes graph; provides stored-view/query helpers and query results                                                                                             | `@canopy/queries` → unchanged                                       | Selects data; does not grant render authority or execute guests; [view helpers](../../../packages/queries/src/views.ts)                                                                                                                             |
| Presentation preferences        | Consumes graph; provides override → settings → type-default resolution as `Result<Node, Error>`                                                                  | `@canopy/settings` → unchanged                                      | Chooses a ViewDefinition, not execution privilege; [resolution](../../../packages/settings/src/view-resolution.ts)                                                                                                                                  |
| Shared graph access             | Consumes graph/session and queries; provides shared request/result/error contracts, query/mutation/event handlers and existing tenant/limit enforcement          | Shared `api-adapter` handlers → `@canopy/graph-access`              | Equivalent WIT and protocol requests use one operation implementation; writes commit through GraphSession; [approved scenarios](../extract-plugin-host/specs/plugin-host-boundary/spec.md#requirement-plugins-and-protocols-share-graph-operations) |
| Plugin execution                | Consumes graph-access and graph; provides WIT bindings, capability enforcement, executor limits and termination helpers                                          | `api-adapter/wasm` → `@canopy/plugin-host`                          | Guest token cannot increase bound authority; no UI or transport ownership; [preservation contract](../extract-plugin-host/specs/plugin-host-boundary/spec.md#requirement-plugin-isolation-survives-package-extraction)                              |
| Transport adaptation            | Consumes shared access; provides framing, servers, schemas and protocol-specific error conversion                                                                | `@canopy/api-adapter` → transport-only responsibilities retained    | Transport changes do not redefine graph operations; no new package per protocol                                                                                                                                                                     |
| Rendering application           | Consumes settings/view definitions and host execution; supplies supported native/guest resolution, host render scope, worker entrypoints and output presentation | `apps/web` → unchanged; future applications consume the same domain | Static output is sanitized; interactive output remains in opaque frames; application-owned worker transport is distinct from protocol adapters                                                                                                      |

Graph definitions are data, not executable authority.
Rendering reads projected graph state; this proposal introduces no new command or persistence path.
Content changes already require stale in-flight output to be discarded.
Historical data reconstruction does not imply replay of historical executable versions or historical permissions; those broader time-travel dimensions remain open product intent.

## Observable contract matrix

These are contract oracles, not claims that every production boundary has been tested in this design session.
Existing test evidence is recorded separately after validation.

| Input or action                                                                                  | Observable success or denial                                                                                            | Status and owner                                                   |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Markdown declares raw HTML and receives the fixed raw-HTML grant                                 | Static output is sanitized and mounted in the closed shadow root                                                        | Approved and implemented; application + host                       |
| Plugin declares interactive; host supplies only raw HTML                                         | No Tier-2 frame or interactive execution authority                                                                      | Approved; application gate implemented                             |
| Plugin declares interactive; host supplies only `render:*` or `*`                                | Wildcard alone does not enable Tier 2                                                                                   | Approved; existing dispatch tests                                  |
| Host explicitly grants interactive and manifest permits it, with supported guest available       | Worker execution followed by opaque-frame presentation                                                                  | Approved; application + host                                       |
| Both raw HTML and interactive are effectively granted, including explicit host interactive grant | Tier 2 wins; interactive output is never mounted inline                                                                 | Approved; must retain this priority across dispatch                |
| Guest supplies `*` while its bound token lacks mutation authority                                | Mutation denied; no node creation or event append                                                                       | Approved and security fix landed; host + shared access             |
| View references a Renderer instance                                                              | Same graph entity resolves for native or WASM dispatch; no RendererDefinition type migration                            | Implemented identity; proposed wording clarification               |
| Interactive grant exists but the required worker guest cannot resolve or load                    | Host-owned unavailable indication; no alternate guest, Tier-1 downgrade, or plugin output mounted for the failed render | Maintainer-selected design; unimplemented; application owner       |
| Raw-only declaration and interactive-only override                                               | Current dispatch falls to static, whose executor recomputes the implicit raw grant                                      | Observed mismatch; do not equate classification with authorization |
| Same content, changed renderer/plugin/grant                                                      | Current cache can reuse output without re-execution because its key contains only node ID and properties hash           | Evidence gap; cache-context contract requires separate decision    |

## Selected fallback and remaining research

1. Missing interactive executable: fail closed with a host-owned indication that the selected renderer is unavailable.
   The maintainer accepts this minimal outcome for now while recognizing that a future fallback may depend on the view.
   Later UX/model research in `canopy-z92` may compare an unavailable indication, property display, and a separately authorized static renderer; no secondary selection or authorization contract is adopted now.
   This choice does not change the existing off-screen preview contract for a successfully selected Tier-2 renderer.
2. Changed render context: [the shared cache](../../../apps/web/src/components/renderers/render-cache.ts) omits renderer, plugin, graph and grant identity, and both rendering components skip execution on cache hits.
   A later decision must identify which context changes invalidate reuse and in-flight results before promising live grant changes.
   This proposal does not invent revocation timing, cache keys, or a general grant lifecycle.

Only the fail-closed choice is added to the normative delta; cache-context behavior remains unresolved.
Malformed manifest JSON is also parsed outside the static executor's exception guard; record this against the existing failure-fallback contract rather than treating source inspection as proof of safe failure.
These findings do not expand `canopy-7rv`, whose approved scope preserves behavior.

## Adversarial review and mitigations

Independent read-only artifact/history review by `/root/renderer_contracts` found no blocking semantic issue.
The initial review confirmed the Markdown-specific ceiling, tier-specific asynchronous output checks, canonical terminology, unchanged ownership boundaries, and then-unresolved fallback/cache choices.
Read-only follow-up review by `/root/renderer_contracts` checked the selected fallback against the generic property-fallback scenario and requested an explicit availability condition on interactive success; root incorporated it.
Unaffected source/history evidence remains applicable because ownership, grant rules, and terminology are unchanged.
Root aligned the proposal's ceiling wording with the requirement and accepts this bounded review; maintainer approval remains pending.
A passing structural validator and this source-based review do not establish runtime acceptance or approve implementation staging.

| Risk category                        | Risk                                                                                                   | Concrete mitigation                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource and performance overhead    | A wording correction grows into new per-render authorization I/O, cache redesign, or worker allocation | Keep the delta documentary; preserve existing bounded cache/frame/worker designs and require a separate reviewed scope for runtime work                                                                  |
| Failure modes and edge cases         | Missing worker or empty intersection is mistaken for permission to execute static output               | Separate tier selection from execution authorization; require the selected fail-closed outcome for unavailable interactive guests and retain denial examples                                             |
| Failure modes and edge cases         | Cached or in-flight output outlives its rendering context                                              | Record the exact missing cache dimensions; do not claim live context-change acceptance without a decided contract and boundary evidence                                                                  |
| Security and isolation               | Manifest declaration or wildcard-expanded intersection is treated as explicit interactive consent      | Require the original host scope's explicit interactive grant and the manifest intersection; preserve wildcard-negative scenarios                                                                         |
| Security and isolation               | Correcting the old static ceiling silently grants graph writes or trusts a guest token                 | Keep execution bounded by host scope and manifest, retain bound-token denial/no-write oracle, and add no grant source                                                                                    |
| Security and isolation               | Metadata names imply authority; iframe isolation is overclaimed                                        | State that Renderer metadata does not grant authority; preserve accepted Tier-2 exfiltration/phishing limitations and their data-minimization/affordance mitigations by reference to the approved design |
| Migration and backward compatibility | Terminology creates a second graph type, migration, or exported alias                                  | Use canonical Renderer; leave stored IDs, bootstrap, public exports and historical documents unchanged                                                                                                   |
| Migration and backward compatibility | Approved package ownership is mistaken for landed implementation                                       | Show both owners; preserve the canonical current map and extraction packet boundaries until actual integration                                                                                           |

## Review and delivery boundary

Validation at the research base: `bunx openspec validate --all --strict` passes 54/54 items.
`bun test apps/web/src/components/renderers/render-tier.test.ts packages/api-adapter/tests/wasm-sandboxed-executor.test.ts packages/api-adapter/tests/wasm-adapter.test.ts` passes 18 tests with 46 assertions.
Those tests establish existing dispatch and bound-token behavior, including the current missing-worker Tier-1 classification; they do not prove the newly selected fail-closed fallback or unresolved cache-context scenarios.
No real browser integration, rendering benchmark, or full `mise run check` was run for this documentation-only draft, and no runtime acceptance is claimed.

The smallest reviewable change is this proposal, design, and two requirement deltas.
No `tasks.md` or implementation Beads are staged.
Normative files are not synchronized and archived designs are not rewritten.
Schema remains `spec-driven`; generated instructions are untouched.
After design approval, any runtime repair needs a complete bounded handoff pinned to the actual approved contract and implementation baseline, with real browser/worker denial evidence where applicable.
Read-only discovery, scenario design, and review do not authorize implementation, merge, or archive.

The maintainer's selected delivery roles are Astra for planning and unresolved architecture, Opus for high-level supervision and directional verification, Terra for implementation orchestration and integration checks, and Luna for bounded end-to-end implementation.
These roles do not authorize execution or publication by themselves.
After the design merges, prepare a small coupled application change for unavailable interactive rendering, followed by independent browser acceptance and supervisory review.
Keep the dispatch/result consumer changes together until they build; do not split production files into independently broken assignments.
Any agy/Gemini delivery route must receive the complete packet and preserve these responsibilities; no particular Gemini model or command is selected here.
The extraction's existing packets remain separate and require renewal if their pinned rendering behavior changes.

Separate follow-up queue, already captured in the parent Beads notes: draft revision uniqueness versus maximum applied event ID; type-authoring singular returns versus `GraphResult.events`; stale OpenSpec checklists versus landed acceptance evidence.
No investigation of those queues is included here.
`canopy-bkk`, `canopy-3xr`, and `canopy-reh` remain deferred and uninvestigated.
