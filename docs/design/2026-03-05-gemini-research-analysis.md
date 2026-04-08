# Gemini research analysis: graph-based semantic PKMS

Research notes from a Gemini-assisted exploration of semantic markdown and graph-based PKMS concepts.
This document maps observations from that research against Canopy's existing design to identify what is already covered, what differs, and what ideas might be worth revisiting later.

This is not a design proposal or decision record — it is a reference for future consideration.

## Source material

The research memo (generated via Gemini) proposes an event-sourced, graph-first knowledge management system with six key areas: graph-first philosophy, event-sourced storage, semantic/virtual nodes, a smart editor (intent engine), schema evolution, and implementation trade-offs.

## Alignment analysis

### Already designed and implemented

These areas from the research memo are already core to Canopy's architecture:

**Graph-first data model.**
The memo's "Key Shift" from files to graph is Canopy's foundational principle.
Canopy goes further by making the graph meta-circular: type definitions, queries, views, and workflows are all nodes.

**Event sourcing as truth source.**
Canopy's event system (`2026-02-08-event-system.md`) already treats events as the canonical source of truth.
All graph state is a projection of the immutable event log.
The memo's "Journal of Truth" maps directly to Canopy's `GraphEvent` model.

**Offline-first with event replication.**
Canopy's sync model (`2026-02-08-sync.md`) already defines event replication without CRDT framework dependency.
Conflict resolution uses deterministic LWW per property during projection.
The memo's sync model is essentially identical to Canopy's existing design.

**Checkpointing/snapshots.**
Canopy's storage layer (`2026-02-08-storage-layer.md`) already defines snapshot strategy for fast startup without full event replay.

**System nodes (meta-graph).**
The memo's "System Nodes as Blueprints" maps to Canopy's metatype system (Layer 1) and system type definitions (Layer 2).
`NodeType` definitions already serve as blueprints with required/optional property slots.

### Partially covered — opportunities for refinement

**Virtual nodes (external entity references).**
Canopy has `ExternalReferenceValue` as a property value type and a system `ExternalReference` node type.
However, the research memo proposes that external URIs should be first-class graph nodes with full edge participation, not just property values pointing outward.

Current state:

- `ExternalReferenceValue` = `{graph: GraphId, target: NodeId}` — cross-graph reference, not general URI
- `NODE_TYPE_EXTERNAL_REFERENCE` exists but is underspecified in current design docs

Gap:
External URIs (Wikipedia pages, YouTube videos, web URLs) cannot currently participate as full nodes without creating a local node to represent them.
The research memo argues these should be lightweight "virtual nodes" that exist in the graph purely as reference targets, without requiring local content.

Recommendation:
Formalize the `ExternalReference` node type to support arbitrary URIs as first-class graph citizens.
Define standard properties (`uri`, `title`, `description`, `fetched_at`) and allow edges to/from these nodes.
Consider whether virtual nodes should be lazily created (on first reference) or eagerly created (on link paste).

**Schema evolution and resilience.**
Canopy uses migration events tagged with `migrationId` to evolve the schema.
The memo proposes complementary patterns:

- _Schema-on-read with upcasters_: transform old event shapes into new ones during projection, rather than rewriting events.
  Canopy's current design replays events through `applyEvent`, which could serve as the upcaster layer.
  This would mean `applyEvent` handles both current and historical event shapes.
- _Graceful degradation_: unknown node types rendered as generic nodes.
  Canopy's validation currently rejects unknown types.
  For multi-device scenarios with staggered updates, graceful degradation would prevent data loss.
- _Additive schema_: system definitions should only add, never remove or rename.
  Canopy's migration system doesn't currently enforce this constraint.

Recommendation:
Add an upcaster registry to the projection pipeline.
Define graceful degradation behavior for unknown types in the renderer.
Document an additive-only policy for system namespace definitions.

**Sync folding on file-based storage.**
Canopy's sync design mentions file-based transport adapters but doesn't detail the per-device branching and folding mechanism the memo describes.

The memo proposes:

- Each device writes events to its own file/directory (avoiding write conflicts on "dumb" storage like Google Drive)
- The app "folds" per-device event streams into a unified causal timeline on read

Current state:
Canopy's file-based transport adapter is listed as a concept but not designed in detail.

Recommendation:
Design the file-based sync adapter with per-device event directories.
Define the folding algorithm (merge sort by UUIDv7 timestamp across device streams).
This is a natural fit since Canopy already uses UUIDv7 with device-seeded random bits for deterministic ordering.

### Not currently in scope — new concepts to evaluate

**Smart editor / intent engine.**
The memo proposes an editor that acts as a "graph ingestion engine," extracting entities and relationships from natural language input.
This is the most significant new concept relative to Canopy's current design.

Key capabilities proposed:

- Entity extraction from prose ("Lunch at McDonald's with Kelsey" → nodes for McDonald's, Kelsey; edges for `located_at`, `attended_by`)
- Triple-awareness: suggesting relationship types based on context
- Schema-aware UI: surfacing property slots based on node type

Assessment:
This is a large scope addition that touches the editor, type system, and UX.
It could be decomposed into:

1. _Entity suggestion_ — as-you-type lookup against existing nodes (simpler, high value)
2. _Relationship suggestion_ — context-aware edge type proposals (medium complexity)
3. _NLP extraction_ — full natural language entity/relationship extraction (high complexity, likely requires LLM integration)

Recommendation:
Phase 1 could be designed as part of the editor system without requiring NLP.
Phases 2-3 would benefit from LLM integration and should be scoped separately.
This aligns with Canopy's extension model — an intent engine could be a WASM extension or API consumer.

**Entity resolution / deduplication.**
The memo proposes heuristic entity resolution to prevent duplicate or "ghost" nodes.

Assessment:
This is valuable for any graph system that grows organically.
It could operate at two levels:

1. _Preventive_ — suggest existing nodes during creation (editor-level)
2. _Corrective_ — detect and merge duplicate nodes after the fact (batch operation)

Recommendation:
Design entity resolution as a query pattern (find similar nodes by name/type/properties).
Merge operations would be expressed as event batches (create edges, update references, soft-delete duplicates).
This fits naturally into Canopy's existing architecture without new primitives.

## Ideas worth revisiting

These are not prioritized recommendations — just concepts from the research that could be interesting to revisit later.

- **Virtual/external nodes as first-class citizens.**
  Canopy has `ExternalReference` but the research pushes on making arbitrary URIs full graph participants.
  Worth considering if/when external linking becomes a focus.

- **File-based sync with per-device event directories.**
  The "folding" pattern (each device writes its own stream, app merges on read) is a clean fit for Google Drive / Dropbox.
  Could inform the file-based transport adapter design.

- **Graceful degradation for unknown types.**
  Rendering unknown node types as generic nodes instead of rejecting them.
  Relevant for multi-device version skew scenarios.

- **Schema-on-read upcasters.**
  Transforming old event shapes during projection rather than migrating events.
  Complementary to Canopy's migration event approach.

- **Entity suggestion and resolution.**
  As-you-type lookup against existing nodes to prevent duplicates.
  Could be an editor feature independent of NLP.

- **Smart editor / intent engine.**
  NLP-based extraction of entities and relationships from prose.
  Large scope — would likely need LLM integration and fits better as an extension.

## Conclusion

The research broadly validates Canopy's core architectural decisions.
Most of the novel ideas (virtual nodes, upcasters, entity resolution) could layer on top of the existing design without fundamental changes.
The smart editor concept is the biggest departure and would be a separate workstream if pursued.
