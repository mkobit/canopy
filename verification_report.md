# Canopy Data Model Verification Report

## 1. Branded types exist for NodeId, EdgeId, Timestamp
**TRUE / FALSE**
- `NodeId`: **TRUE** (`packages/types/src/identifiers.ts`)
- `EdgeId`: **TRUE** (`packages/types/src/identifiers.ts`)
- `Timestamp`: **FALSE**
  - Instead: `Instant` is used (`packages/types/src/temporal.ts`) which is a branded string aligning with TC39 Temporal.Instant.

## 2. Zod schemas exist for runtime validation
**FALSE**
- Core validation logic in `packages/core/src/validation.ts` (`validateNode`, `validateEdge`) is manually implemented using helper functions.
- Zod is used internally for validating `PropertyDefinition` structures (imported from `@canopy/schema`), but full runtime validation schemas for Nodes/Edges are not exported or used in the examined packages.

## 3. Readonly modifiers on interfaces
**TRUE**
- Evidence: `packages/types/src/node.ts` (Line 10: `export type Node<...> = Readonly<{`)
- Evidence: `packages/types/src/edge.ts` (Line 12: `export type Edge<...> = Readonly<{`)

## 4. Node minimum fields: id, type, created, modified
**FALSE**
- The `created` and `modified` fields are not top-level properties. They are nested within a `metadata` property.
- Implementation (`packages/types/src/node.ts`):
  ```typescript
  export type Node<T extends TypeId = TypeId> = Readonly<{
    id: NodeId;
    type: T;
    properties: PropertyMap;
    metadata: TemporalMetadata; // created/modified are here
  }>;
  ```

## 5. Blocks modeled as nodes (not properties)
**NOT_IMPLEMENTED**
- No evidence of "Blocks" or `Block` type definitions was found in `packages/types/src/` or `packages/core/src/`.

## 6. Edges have own IDs, source, target, type, properties
**TRUE**
- Evidence: `packages/types/src/edge.ts`
  ```typescript
  export type Edge<T extends TypeId = TypeId> = Readonly<{
    id: EdgeId;
    type: T;
    source: NodeId;
    target: NodeId;
    properties: PropertyMap;
    metadata: TemporalMetadata;
  }>;
  ```

## 7. Meta-circular: NodeType definitions as nodes
**TRUE**
- Evidence: `packages/core/src/bootstrap.ts` ensures a node with ID `SYSTEM_IDS.NODE_TYPE_DEF` exists.
- System IDs defined in `packages/core/src/system.ts`.

## 8. Meta-circular: EdgeType definitions as nodes
**TRUE**
- Evidence: `packages/core/src/bootstrap.ts` ensures a node with ID `SYSTEM_IDS.EDGE_TYPE_DEF` exists.

## 9. Meta-circular: Query definitions as nodes
**TRUE**
- Evidence: `packages/core/src/bootstrap.ts` bootstraps `QUERY_DEFINITION_DEF` and system queries (e.g., `QUERY_ALL_NODES`) as nodes in the graph.
