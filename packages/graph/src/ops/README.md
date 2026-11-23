# Graph operations

## Overview

This directory provides pure, event-emitting graph mutation operations for nodes, edges, ordered child blocks, and schema/type authoring, returning `Result` values with new `Graph` snapshots and `GraphEvent` lists. An internal base62 fractional-indexing helper (`generateKeyBetween`) computes lexicographic `position` keys for `insertBlock`.

## Interface

- `[index.ts:*]` Re-exports all public symbols from `./node`, `./edge`, `./blocks`, and `./type-authoring` (excludes `./fractional-index`).
- `[node.ts:NodeOperationOptions]`, `[node.ts:addNode]`, `[node.ts:removeNode]`, `[node.ts:updateNode]` Node CRUD operations returning `Result<GraphResult<Graph>, Error>`.
- `[edge.ts:EdgeOperationOptions]`, `[edge.ts:createEdgeAction]`, `[edge.ts:addEdge]`, `[edge.ts:removeEdge]`, `[edge.ts:updateEdge]` Edge CRUD operations returning `Result`.
- `[blocks.ts:InsertBlockOptions]`, `[blocks.ts:insertBlock]` Inserts a block node and `CHILD_OF` edge with fractional-index `'position'`.
- `[fractional-index.ts:generateKeyBetween]` `(a: string | null, b: string | null) => string` (internal to `ops`).
- `[type-authoring.ts:CreateNamespaceInput]`, `[type-authoring.ts:createNamespace]`, `[type-authoring.ts:ShapePropertyInput]`, `[type-authoring.ts:CreateShapeInput]`, `[type-authoring.ts:createShape]`, `[type-authoring.ts:CreatePropertyTypeInput]`, `[type-authoring.ts:createPropertyType]` Schema authoring operations returning `Result<GraphResult<Graph>, ValidationError>`.

## Invariants

- `[node.ts:addNode]` Rejects duplicate `node.id` and `status === 'inactive'` shape definitions (`SHAPE_INACTIVE` via `resolveShape`); `[node.ts:removeNode]` rejects system nodes (`isSystemNodeId`), is a no-op if absent, and cascades edge deletion; `[node.ts:updateNode]` rejects changing `node.id` or `node.shape`.
- `[edge.ts:addEdge]` and `[edge.ts:updateEdge]` Reject duplicate `edge.id`, reject changing `edge.id` or `edge.shape`, and require both `source` and `target` nodes to exist in `graph.nodes`.
- `[blocks.ts:insertBlock]` Adds the block node first, then creates a `SYSTEM_EDGE_SHAPES.CHILD_OF` edge to `parentId` with fractional-index `'position'`; if `previousBlockId` is provided, requires it to be an existing `CHILD_OF` child of `parentId`.
- `[fractional-index.ts:generateKeyBetween]` Uses the 62-character base62 `DIGITS` alphabet and requires `a < b` when both are non-null.
- `[type-authoring.ts:createNamespace]` Validates `input.name` with `NamespaceSchema` and rejects `RESTRICTED_NAMESPACE_KINDS` and duplicate names; `[type-authoring.ts:checkNamespaceWritable]` requires `input.namespace` to resolve to an existing writable `SYSTEM_IDS.NAMESPACE` node; `createShape` canonicalizes `schemaOrgUri` via `canonicalizeUri`, rejects `valueKind === 'list'` on new authoring, emits the `SYSTEM_IDS.SHAPE` node event, and emits default `QueryDefinition`, table `ViewDefinition`, and `SYSTEM_EDGE_SHAPES.DEFAULT_VIEW` edge events when `input.entityKind === 'node'`.

## Side Effects

- All exported `ops` functions call `createInstant()` and `createEventId()` (and `createNodeId()` / `createEdgeId()` where creating entities) for non-deterministic ID/time generation; they do not mutate input `Graph` values or perform I/O.
- `[fractional-index.ts:generateKeyBetween]` Throws `Error` if `a >= b` when both are non-null.

## Verification

- Run: `bun test`
