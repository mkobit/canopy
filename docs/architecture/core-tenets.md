# Core tenets

This document records Canopy's product and architectural intent.
It guides design interpretation; it does not assert that every capability is implemented or approve unresolved designs.
The [core data model](../design/2026-02-06-core-data-model.md) defines structural primitives, and the [bounded-context map](bounded-contexts.md) defines current package ownership.

## One domain, several uses

Canopy is a graph-native knowledge system used for personal knowledge management, remote agent memory, and graph knowledge database access.
A secure plugin ecosystem extends those uses.
The intended outcome is a full suite of products sharing this domain, rather than a single note-taking application with unrelated integrations.
Agents, CLI commands, MCP, other API protocols, and rendering applications are features and access surfaces built on the core domain model.
They must not become competing definitions of that model.

| Product dimension             | User outcome                                                              | Shared foundation                                                         |
| :---------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------ |
| Personal knowledge management | Capture, organize, review, relate, and present knowledge                  | Typed nodes and edges, queries, views, history                            |
| Remote memory                 | People and agents use and maintain knowledge across sessions and machines | The same graph domain, provenance, lifecycle policies, controlled access  |
| Graph knowledge database      | Applications query and change structured knowledge                        | Shared command/query semantics exposed through supported APIs             |
| Plugin ecosystem              | Extend behavior, retrieval, workflows, and presentation                   | Graph definitions and supported host contracts with enforced capabilities |

This is a product direction, not a decision about separate binaries, commercial editions, or repository layout.
The browser application is one rendering application; the CLI and MCP are other access surfaces.
A remote server enables deployment and coordination around the same domain.

## Graph-native content and definitions

Nodes, typed edges, and their properties represent knowledge and the definitions used to interpret it.
Types, queries, views, renderers, and workflow definitions can themselves be graph entities.
This is the meta-circular model: the system reads its own definitions to determine behavior.
Captured content belongs in the graph rather than a separate file-based document model.
Physical persistence formats and executable packaging are implementation concerns, not alternative content domains.

## Graph-defined presentation

Presentation is part of the model, not merely a fixed UI placed over it.
Rendering applications look up view and renderer definitions to select behavior and construct the UI.
Those definitions can resolve to supported WASM plugin components or application-provided renderers.
Content remains independent of the selected presentation, so different queries and views can present the same knowledge differently.
A review dashboard can therefore be a query-driven view rather than a new core feature for each dashboard variation.

The existing [view-rendering specification](../../openspec/specs/view-rendering/spec.md) defines the view resolution cascade, native and WASM dispatch, and recursive delegation.
The [content-rendering specification](../../openspec/specs/content-rendering-plugin/spec.md) defines graph-resident plugin lookup and execution.
The [sandboxed rendering specification](../../openspec/specs/sandboxed-iframe-rendering/spec.md) defines interactive isolation.
Graph-defined behavior does not bypass host capability checks or sandbox boundaries.
The extent of graph-defined application composition, supported component kinds, and the remaining application shell are design questions; these specifications do not establish that every UI element is already graph-defined.

## Event sourcing and separated reads and writes

Event sourcing and command/query responsibility separation (CQRS) guide every domain-facing surface.
Commands express changes through the event-log write path; queries read derived graph states and projections.
Clients and plugins must preserve those semantics rather than create independent persistence or mutation models.
The [graph model](graph-model.md) describes the existing event-log and GraphSession architecture.
Event history is the foundation for provenance and explaining automated changes.
What actor, source, causal, and workflow evidence must be recorded still needs explicit design; an event log alone does not supply missing attribution.

## Time travel

Time travel is a core tenet, not an optional memory plugin feature.
Designs must identify which historical dimensions they preserve and can reconstruct.
Historical graph data, type definitions, view definitions, executable versions, projections, and permissions may have different replay requirements.
Reconstructing recorded state, reproducing a past display, and distinguishing event time from recording time are separate questions.
No blanket guarantee of all those dimensions is implied by event sourcing alone.

## Ownership, concurrency, and graph boundaries

User-owned data must support local use and eventual remote, simultaneous multi-device operation.
Event ordering and conflict resolution must have explicit semantics; retaining events alone does not settle competing edits.
The current [core data model](../design/2026-02-06-core-data-model.md) describes one graph per vault and namespace partitioning.
Spaces, sharing, agent-owned graphs, virtual nodes, virtual graphs, and cross-graph projections remain open design work.
Do not silently interpret a graph boundary as an authorization boundary or treat a projected reference as a copied entity.

## Extension and enforcement boundaries

Distinguish built-in system plugins, Canopy-maintained extensions, and the broader marketplace/ecosystem.
Maintenance ownership, distribution, runtime location, and granted authority need not be the same classification.
Durable workflows, approval staging, knowledge maintenance, and retrieval plugins are candidate capabilities whose placement remains under design.
MCP and other APIs expose domain behavior; they do not own graph semantics.
Pluggable authentication and authorization must define what is replaceable and where enforcement remains mandatory.

## Reading and writing designs

Each substantive design should explain its user-visible outcome and name the core domain concepts it uses or changes.
Distinguish core semantics from projections, plugins, rendering applications, and protocol adapters.
State what exists, what is proposed, and what remains unresolved.
Explain relevant write/read paths, historical behavior, concurrent behavior, and capability boundaries with a concrete example.
Link to authoritative specifications instead of copying their requirements into every design.
When sources disagree, identify the conflict explicitly; do not silently turn a client implementation or historical proposal into a core invariant.
Historical archived designs remain records of their decisions.
Changes to normative behavior require the project's OpenSpec proposal and adversarial-review process.

## Concrete interpretation examples

### A new presentation

A user selects a view for a node or its type.
The rendering application resolves the graph's view and renderer definitions and invokes the supported native or WASM renderer.
Child content can resolve its own presentation through the same mechanism.
The model supports extending presentation through definitions and plugins without adding a hardcoded content-type branch for each new format.
See the [view-rendering specification](../../openspec/specs/view-rendering/spec.md) for the current contract.

### An agent proposes knowledge

An agent uses an access surface to submit domain operations.
The operations retain the same validation, event-log, and projection semantics used by other clients.
Whether the agent works in a separate graph, a draft, or a staging projection is unresolved.
An approval policy could route proposed additions for review, but its interception point and publication semantics require design.
Existing [draft sessions](../../openspec/specs/draft-session/spec.md) are a relevant contract to assess, not proof that the broader graph-sharing model is settled.

### A review dashboard

Queries select fleeting notes, stale memories, or other relevant nodes.
A view presents those results as a dashboard.
A periodic aged-node plugin may resurface or expire selected nodes under an explicit lifecycle policy.
Presentation, selection, scheduling, and lifecycle changes are distinct responsibilities even when one experience combines them.

## Recorded direction and open decisions

These items preserve the product discussion without treating brainstorming as approved design.

| Area                        | Direction                                                                           | Still open                                                                                                                                    |
| :-------------------------- | :---------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows                   | Triggered, durable execution with Temporal-style behavior                           | Primitive versus system plugin, runtime choice, recovery and execution ownership                                                              |
| Memories and fleeting notes | First-class knowledge experiences using the graph model                             | Types versus traits or states, promotion, consolidation, conflicting evidence, forgetting                                                     |
| Approval                    | Explore policies that stage additions to selected graphs for review                 | Before acceptance versus before publication, graph/draft/projection representation                                                            |
| Search                      | Graph queries plus later pluggable nearest-neighbor or graph-assisted RAG retrieval | Query contracts, indexing, retrieval providers, division between core and plugins                                                             |
| Aging                       | A first-party periodic plugin selects stale nodes and expires or presents them      | Age signals, query semantics, scheduling, and whether expiry hides, archives, or deletes                                                      |
| Time travel                 | A core capability spanning graph-based knowledge                                    | Reconstructable dimensions and historical execution, schema, display, and permission semantics                                                |
| Spaces and sharing          | Explore graphs, nodes, virtual nodes, virtual graphs, and projections together      | Identity, ownership, live versus copied references, cross-graph visibility                                                                    |
| Capture                     | Represent captured knowledge as graph data                                          | Source connection and refresh behavior; no separate file-based content domain                                                                 |
| Multiple devices            | Concurrent local and remote access with user-owned data                             | Conflict behavior, synchronization topology, execution coordination                                                                           |
| Plugin categories           | Built-in system plugins, Canopy-maintained extensions, and ecosystem offerings      | Labels, distribution, compatibility, marketplace governance, trust versus origin                                                              |
| APIs and MCP                | Expose the shared domain through useful client protocols                            | MCP plugin versus adapter, transport, query mapping; GraphQL-style does not mean GraphQL-only                                                 |
| Identity and authorization  | Explore pluggable integrations for human and agent use                              | Provider and enforcement boundaries, server plugin versus middleware, self-hosted and enterprise needs                                        |
| Portability                 | Consider moving owned knowledge between deployments                                 | How definitions and required plugins remain interpretable; no full packaging commitment                                                       |
| Rate limits and policy      | Middleware or enforcement may be useful                                             | Relationship-based authorization and RDF/quads need separate evaluation; resource-budget management is not an established product requirement |

The phrase "src identity" from the discussion remains undefined and must be clarified before assigning it a principal type.
RDF/quads describe possible modeling choices; relationship-based access control describes authorization, so they must not be treated as interchangeable mechanisms.
CRDT exploration motivates revisiting concurrency semantics, but does not override the current event-log architecture or authorize a replacement synchronization model.

## Design consistency follow-up

The active-design audit covered all 20 non-archived design artifacts present during this documentation pass.
Existing core/client separation is particularly clear in [graph API access](../../openspec/specs/graph-api-access/spec.md), [indexed reads](../../openspec/specs/indexed-read-model/spec.md), and [runtime WebClip type authoring](../../openspec/specs/web-clip-capture/spec.md).
The following discrepancies require contract review, not editorial assumptions:

- [View rendering](../../openspec/specs/view-rendering/spec.md) selects render tiers using declared capability, while [content rendering](../../openspec/specs/content-rendering-plugin/spec.md) requires effective granted capability
- Rendering specifications use both `Renderer` and `RendererDefinition` without consistently explaining the distinction
- [Draft sessions](../../openspec/specs/draft-session/spec.md) require distinct revisions for distinct states while defining the revision as maximum event ID; different event sets can share that maximum
- [Type authoring](../../openspec/specs/type-authoring/spec.md) uses singular event-return wording while the [default-view design](../../openspec/changes/auto-default-view-on-type-creation/design.md) describes plural `GraphResult.events`; change lifecycle must be checked before reconciling them

Archived designs retain their historical meaning.
Broader application composition, time-travel dimensions, virtual graphs, and complete memory semantics remain design work rather than implemented guarantees.
