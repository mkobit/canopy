# Technical Design: PropertyType Constraint Validation

## Context

Canopy's meta-circular architecture models `NodeType`, `EdgeType`, `PropertyType`, `ViewDefinition`, and `QueryDefinition` as first-class nodes in the graph (`packages/graph/src/system.ts`). While `PropertyDefinition` in TypeScript and Zod schemas (`schemas.ts`) includes basic fields like `regex`, `min`, `max`, and `choices`, runtime validation (`validation.ts`) and type authoring (`ops/type-authoring.ts`) do not yet enforce:

1. Cardinality constraints (`cardinality: 'one' | 'many'`).
2. Closed-value enums (`choices`) across all property kinds.
3. Typed references (`targetTypeId`), which restrict `valueKind: 'reference'` values to point exclusively to nodes of a specified target `NodeType`.

Logseq 2.0 shipped `:db/cardinality`, `:property/closed-values`, and tag-filtered Node references. This design adapts those reference patterns to Canopy's graph engine while strictly preserving Canopy's core architectural invariants: Zod schemas as the runtime validation source of truth, `Result<T, E>` error handling, branded IDs, immutable data structures (`readonly`), and no `any` types.

## Goals / Non-Goals

**Goals:**

- Extend `PropertyDefinition` interface and `PropertyDefinitionSchema` to support `cardinality` (`'one' | 'many'`) and `targetTypeId` (`TypeId`).
- Update `propertyTypeProperties` metatype in `bootstrap-definitions.ts` to include system property definitions for constraints (`cardinality`, `choices`, `targetTypeId`, `regex`, `min`, `max`).
- Implement robust validation in `validation.ts` for cardinality, closed-values (`choices`), and graph-aware typed reference targets (`targetTypeId`).
- Update `createPropertyType` in `ops/type-authoring.ts` to accept constraint parameters and serialize them into `PropertyType` definition node properties.
- Ensure `validatePropertyByType` extracts and enforces these constraints for standalone `PropertyType` nodes.

**Non-Goals:**

- Modifying or extending existing graph event payload types (`NodeCreated`, `NodePropertiesUpdated`, etc.).
- Adding CRDT-style conflict resolution for list property elements.
- Implementing automatic value coercion or automatic data mutation when constraints are violated.

## Decisions

### Decision 1: Modeling Cardinality on PropertyDefinition vs. Preserving Legacy `list` Kind

- **Choice**: Add an explicit optional `cardinality?: 'one' | 'many'` field to `PropertyDefinition`. If `cardinality` is omitted, default to `'one'` unless `valueKind` is `'list'`, in which case default to `'many'`.
- **Rationale**: Explicit cardinality allows any scalar `valueKind` (e.g., `text`, `number`, `reference`) to be declared as multi-valued (`cardinality: 'many'`) without overloading `valueKind`. Preserving `valueKind: 'list'` as implicitly `cardinality: 'many'` guarantees 100% backward compatibility for existing graph data.
- **Alternatives Considered**:
  - _Deprecating `valueKind: 'list'` immediately_: Rejected to prevent breaking existing graphs and bootstrap definitions where `valueKind: 'list'` is in use.

### Decision 2: Graph-Aware Target Type Validation in `validateNode`

- **Choice**: Enforce `targetTypeId` inside `validateNode(graph, node)` by querying `graph.nodes.get(referencedNodeId)`.
- **Rationale**: Node property validation occurs within the context of a `Graph` projection. Validating that a referenced target node exists in `graph.nodes` and that `targetNode.type === targetTypeId` guarantees referential type safety at commit time without introducing a separate asynchronous index lookup step.
- **Alternatives Considered**:
  - _Validating target references in a secondary background pass_: Rejected because invalid references should fail synchronously during `GraphSession.commit` write validation rather than producing silently corrupt graph projections.

### Decision 3: Persistence Format for Constraints on `PropertyType` Definition Nodes

- **Choice**: Store constraint properties on `PropertyType` nodes as JSON-serialized strings or standard property values (`cardinality` as text, `choices` as JSON string array or list, `targetTypeId` as reference string, `regex` as text, `min`/`max` as numbers).
- **Rationale**: Aligns with existing `NodeType` property serialization in `bootstrap-definitions.ts` and `validation.ts` (`extractProperties`), ensuring runtime projection and Zod schema parsing remain clean and uniform.
- **Alternatives Considered**:
  - _Creating separate constraint definition sub-nodes_: Rejected as unnecessary over-nesting; property definition node properties are designed to hold flat properties and JSON metadata.

## Adversarial review and mitigations

### 1. Resource and Performance Overhead

- **Graph Lookup Cost during Reference Validation**:
  - _Risk_: When a node has multiple `cardinality: 'many'` reference properties with `targetTypeId` constraints, validating each reference requires `graph.nodes.get(targetId)`. In a batch write of 1,000 nodes, thousands of map lookups could degrade commit throughput.
  - _Mitigation_: Map lookups in standard JS `Map` (`graph.nodes`) operate in $O(1)$ time. `validateNode` only performs `graph.nodes.get()` when `valueKind === 'reference'` and `targetTypeId` is specified. Benchmark targets under 0.5ms per node validation are easily maintained.
- **JSON Deserialization Overhead**:
  - _Risk_: `extractProperties` parses JSON for `properties` on definition nodes. Re-parsing JSON on every single node validation step would cause CPU hot-spots.
  - _Mitigation_: `getNodeTypeDefinition` retrieves the definition node. Property extraction uses safe Zod array parsing (`PropertyDefinitionSchema.array().safeParse`). Since node types are indexed/cached in memory during `GraphSession` lifetime, validation overhead remains minimal.
- **Array Allocation in Error Reporting**:
  - _Risk_: Creating `ValidationError` objects on every validated property could increase GC pressure during large projection rebuilds.
  - _Mitigation_: Validation functions return empty array constants (`[]`) on success. `ValidationError` objects are allocated only when validation actually fails.

### 2. Failure Modes and Edge Cases

- **Tightening Constraints on Existing Data (Replayable Migration Events)**:
  - _Risk_: A user or schema migration adds a `choices` constraint or changes `cardinality` from `'many'` to `'one'` on a `PropertyType`. The event log contains historical `NodeCreated` or `NodePropertiesUpdated` events that were valid when written but violate the newly tightened constraint. If event log projection replay enforced strict write-time validation, historic log replay would throw and crash the application, breaking event log CQRS invariants.
  - _Mitigation_: **Event log projection replay MUST NEVER throw or reject historic events.** In Canopy's CQRS architecture, event validation is strictly a gatekeeper for _new_ incoming mutations during `GraphSession.commit`. Projection replay (`applyEvent`) applies events deterministically to state regardless of schema validity. When a constraint is tightened retroactively, `GraphSession.commit` will block _new_ invalid writes, while existing invalid nodes in the graph projection are flagged by `validateNode` if queried for health/linting, without corrupting or stopping log replay.
- **Dangling References and Batch Commit Ordering**:
  - _Risk_: In a batch operation (`GraphSession.commit` with multiple events), Node A is created referencing Node B, but Node B's creation event is in the same batch or ordered after Node A's validation.
  - _Mitigation_: `GraphSession.commit` applies events incrementally to a transient draft graph projection before running batch validation, or validates the end-state draft graph after applying the batch of events. If Node B is created within the same batch commit, it will exist in `graph.nodes` when Node A's target type validation executes. If Node B is missing entirely from the graph, validation returns a `ValidationError` specifying `Target node '${targetId}' not found in graph`.
- **Invalid Constraint Specifications on Authoring**:
  - _Risk_: An authored `PropertyType` specifies an invalid regular expression (e.g. `"[a-z"` missing a bracket) or a `targetTypeId` that points to a non-existent `NodeType`.
  - _Mitigation_: `createPropertyType` validates constraint parameters prior to emitting the `NodeCreated` event. If `regex` is provided, `new RegExp(regex)` is evaluated inside `fromThrowable`; if invalid, `createPropertyType` returns a `Result.err`. If `regex` validation encounters an unparseable pattern during node validation, `validateRegex` returns a clean `ValidationError` ("Property has an invalid regular expression constraint") without throwing a runtime `SyntaxError`.

### 3. Backward Compatibility

- **Legacy Graph Data without Constraints**:
  - _Risk_: Existing graphs contain `PropertyDefinition` objects without `cardinality` or `targetTypeId` fields.
  - _Mitigation_: All newly added fields in `PropertyDefinition` and `PropertyDefinitionSchema` are strictly optional (`cardinality?: 'one' | 'many'`, `targetTypeId?: TypeId`). When `cardinality` is `undefined`, the system preserves existing behavior (`valueKind === 'list'` is treated as `'many'`, all other kinds are treated as `'one'`).
- **Zod Schema Source of Truth**:
  - _Risk_: Introducing new validation logic outside Zod schemas could lead to schema/runtime drift.
  - _Mitigation_: `PropertyDefinitionSchema` in `@canopy/graph` (`schemas.ts`) remains the single source of truth for runtime property definition structure. All property extraction functions (`extractProperties`) pass raw data through `PropertyDefinitionSchema.safeParse()`.

## Risks / Trade-offs

- **[Risk]**: Checking `targetTypeId` against `graph.nodes` requires passing `Graph` to property validation helpers.
  - **[Mitigation]**: `validateNode(graph, node)` already accepts `Graph` as its first argument, so context is readily available. `validatePropertyByType` can accept optional `Graph` for reference checking.
- **[Risk]**: Deep enum choices validation on array properties (`cardinality: 'many'`) increases validation code complexity.
  - **[Mitigation]**: Refactor `validateChoices` to handle both scalar string/number values and array elements iteratively using Remeda helpers, returning precise indexed error paths (e.g., `path: ['tags', '0']`).
