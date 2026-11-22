# Open and single-shape entities

> Status: **approved** (passed adversarial review)
> Bead: `canopy-anir.3.1`
> Depends on: [Canopy v0 architecture](../architecture/canopy-v0-architecture.md) ("Open versus shaped elements", "System node types", journeys 1-3), [Core tenets](../architecture/core-tenets.md), [Core data model](2026-02-06-core-data-model.md) §6
> Baseline: `main` @ `f020d1b`

## Context

The architecture requires that every `Node` and `Edge` carries `shape: Option<ShapeId>`.
The kernel does not implement this today:

- `Node.type` and `Edge.type` are required `TypeId` values (`packages/graph/src/node.ts`, `edge.ts`, `schemas.ts` `NodeSchema`/`EdgeSchema`).
- The only open concept is the `canopy:open` sentinel in `packages/graph-access/src/canopy-v0-server.ts` (`OPEN_NODE_SHAPE`).
- `isNode` and `isEdge` in `packages/graph/src/guards.ts` require `'type' in value`.
- `validateNode` returns success when the type definition is missing, and it never inspects undeclared properties (`packages/graph/src/validation.ts`).
- `validateEdge` treats `sourceTypes`/`targetTypes` as hard errors, which contradicts core data model §6 ("best-effort warnings") and the `createEdgeType` doc comment.
- Shape bindings that reference a `PropertyType` are copied inline at creation (`packages/graph/src/ops/type-authoring.ts` `resolvePropertyInput`), so the reference and most constraints are lost.
- `PROPERTY_VALUE_KINDS` has no `integer` or `url` kind and no uniqueness check; `instant` checks `typeof string` and `plain-date` checks `typeof string` in `validation.ts`.
- `GraphSession.commit` validates all-or-nothing without session serialization, returns only the first error as an `Error` string, and does not assign a `batchId` (`packages/graph/src/graph-session.ts`).
- `validateDraftEvents` in `packages/graph/src/incremental-projection.ts` duplicates `validateCommit`, and `draft-session.ts` reads `node.type.toLowerCase()` unconditionally.
- `packages/graph-access/typespec/main.tsp` requires `shapeId` on `CanopyV0EdgeRecord` and `edgeTypeId` in `canopy-v0-server.ts` `buildCreateEdgeEvent`, which blocks open edges.
- `canopy-v0-server.ts` writes `system:nodetype:shape-migration`, `system:nodetype:bundle`, and `system:edgetype:render-selector` without bootstrap definitions, and reads PropertyType `scalarKind` instead of `valueKind`.
- The unified WIT in `main.tsp` uses `node-type: type-id` on `node-created-event` and `graph-node`.
- `derived_from` and `supersedes` exist only in the architecture doc.

## Goals and non-goals

Goals:

- Make open (`shape` absent) and shaped (exactly one `ShapeId`) first-class in kernel types, guards, indexes, Zod schemas, events, TypeSpec, and WIT.
- Replace `NODE_TYPE` and `EDGE_TYPE` with one `SHAPE` meta-type that matches `CanopyV0ShapeRecord`.
- Extend flat `PropertyDefinition` in `@canopy/graph` to support `Timestamp`, `NonNegativeInt`, safe `URL`, closed `Enum`, `Set<Label>`, `Ref<Shape>`, and `schemaOrgUri`.
- Enforce `closed` shapes, missing-shape rejection, and durable `propertyTypeId` bindings.
- Make `GraphSession.commit` serialize writes, own `BatchId`, unify batch validation with `DraftSession`, and return all structured validation errors.
- Keep `mise run check` green across the whole monorepo after every sequenced bead.

Non-goals:

- Multi-shape stacking or shape inheritance.
- A `ShapeChanged` event or in-place re-shaping of an entity; lineage uses `derived-from` and `supersedes`.
- An `ops/lineage.ts` module or specialized planner wrappers; existing `addNode`, `addEdge`, `canonicalizeUri`, and `ReadModelPort.nodesWhereEquals` cover Journeys 1-3.
- Hard delete guards on in-use `Shape` or `PropertyType` nodes (tracked as a follow-up refinement bead).
- A rewrite of persisted logs; compatibility is read-side only.

## Decisions

These decisions are approved and are not reopened here.

1. `Node.type` and `Edge.type` become optional `shape?: ShapeId | undefined`.
   Event fields `nodeType` and `edgeType` become optional `shapeId?: ShapeId | undefined`.
   A pure read-side upcaster maps legacy fields and the `canopy:open` sentinel before Zod decoding.
   New events are written only in the new form.
2. `NODE_TYPE` and `EDGE_TYPE` merge into one `SHAPE` meta-type with `entityKind: 'node' | 'edge'`, `closed: boolean`, property bindings, and optional `schemaOrgUri`.
3. Open edges are allowed.
   `CanopyV0EdgeRecord.shapeId` becomes optional, `CanopyV0BatchOperation` `create-edge` accepts optional `shapeId`, and WIT `node-type: type-id` becomes `shape-id: option<shape-id>`.
4. `closed` defaults to `false`.
   A closed shape rejects undeclared properties.
   A shaped entity whose Shape node is missing or has the wrong `entityKind` is rejected.
   Open entities skip shape validation.
   Bindings keep a durable `propertyTypeId`, resolved at validation time; inline bindings stay valid.
   Edge source/target shape constraints and node outgoing/incoming edge constraints are warnings.
5. PropertyType composition covers `Timestamp`, `NonNegativeInt`, `URL`, closed `Enum`, `Set<Label>`, `Ref<Shape>`, cardinality `one | many`, and optional `schemaOrgUri`.
6. `GraphSession.commit` assigns one branded `BatchId` per commit when absent, keeps serialized all-or-nothing validation, and returns all structured validation errors.
   Bootstrap adds `derived-from`, `supersedes`, and `proxy`.
7. Implementation splits into four sequenced child beads (`a` through `d`) that each keep `mise run check` green across the workspace.
8. Minimal bootstrap and lineage: keep 3 lineage/proxy Shapes (`derived-from`, `supersedes`, `proxy`), 3 minimal `closed: false` Shapes already emitted by `canopy-v0-server.ts` (`shape-migration`, `bundle`, `render-selector`), and 1 system PropertyType (`system:propertytype:url`, used by `proxy`).
   Drop `ops/lineage.ts` (`planProxyNode`, `planDerivedNode`) and drop the 3 unused `system:propertytype:*` nodes (`timestamp`, `non-negative-int`, `label-set`).
   Keep pure `canonicalizeUri` in `packages/graph/src/url.ts`, and reuse `createIndexedReadModel(graph).nodesWhereEquals('uri', canonicalUri, SYSTEM_IDS.PROXY)` for proxy lookup.
   File a follow-up bead to re-evaluate bootstrap Shapes after `canopy-anir.3.1`.
9. Flat `PropertyDefinition`: extend flat `PropertyDefinition` in `@canopy/graph` in place rather than adding nested wrapper types, and map flat fields to TypeSpec models at the `graph-access` boundary.
10. Loose Shape lifecycle: `SHAPE_INACTIVE` is an `error` on create and a `warning` on update; `NodeDeleted` never triggers shape validation.
    Deleting a `Shape` or `PropertyType` node stays allowed for now; file a follow-up bead for in-use delete guards and `SHAPE_INACTIVE` strictness.
11. Resolved open questions: keep strict Rule 2 (`SHAPE_NOT_FOUND`) on creates and updates; use `ReadModelPort.nodesWhereEquals` for proxy `uri` lookup; defer a bootstrap version constant until a sync handshake consumes it (`knip` rejects unused exports).

## Detailed design

All optional fields in TypeScript types include `| undefined` because `tsconfig.base.json` sets `"exactOptionalPropertyTypes": true`.

### Identifiers

`packages/graph/src/identifiers.ts` keeps the repository's `unique symbol` brand pattern:

```ts
export declare const shapeIdBrand: unique symbol;
export declare const propertyTypeIdBrand: unique symbol;
export declare const batchIdBrand: unique symbol;

export type ShapeId = string & Readonly<{ [shapeIdBrand]: never }>;
export type PropertyTypeId = string & Readonly<{ [propertyTypeIdBrand]: never }>;
export type BatchId = string & Readonly<{ [batchIdBrand]: never }>;
/** @deprecated Removed in bead d. */
export type TypeId = ShapeId;
```

Export phasing satisfies `knip` unused-export checks on every bead:

- Bead `a` exports `ShapeId`/`ShapeIdSchema`/`asShapeId`, `BatchId`/`BatchIdSchema`/`asBatchId` (`z.string().min(1).transform(asBatchId)`), and deprecated `TypeId`/`TypeIdSchema`/`asTypeId` (removed in bead `d`).
- Bead `b` adds `PropertyTypeId`, `PropertyTypeIdSchema`, and `asPropertyTypeId`.
- Bead `c` adds `createBatchId` (`batch:${uuidv7()}`).
- `ShapeId` and `PropertyTypeId` equal the `NodeId` of their definition node.

### Kernel types, guards, and ops

```ts
// node.ts
export type Node<S extends ShapeId = ShapeId> = Readonly<{
  id: NodeId;
  shape?: S | undefined;
  properties: PropertyMap;
  metadata: TemporalMetadata;
}>;

// edge.ts
export type Edge<S extends ShapeId = ShapeId> = Readonly<{
  id: EdgeId;
  shape?: S | undefined;
  source: NodeId;
  target: NodeId;
  properties: PropertyMap;
  metadata: TemporalMetadata;
}>;
```

- `NodeSchema` and `EdgeSchema` use `shape: ShapeIdSchema.optional()`.
- `guards.ts` (`isNode`, `isEdge`) replaces `'type' in value` with `!('shape' in value) || value.shape === undefined || typeof value.shape === 'string'`, so open entities match.
- `ops/node.ts`, `ops/edge.ts`, and `ops/blocks.ts` type `batchId?: BatchId | undefined`.
- `createEdgeAction` in `ops/edge.ts` takes `parameters: Readonly<{ source: NodeId; target: NodeId; shape?: ShapeId | undefined }>`.
- `addNode` runs its inactive-shape check only when `node.shape !== undefined` (`error` on `create`).
- `updateNode` (`ops/node.ts:181`) and `updateEdge` (`ops/edge.ts:197`) reject changing `.shape` (`Cannot change node shape during update` / `Cannot change edge shape during update`) and pass `'update'` mode (plus `existingNode` as `previousNode` on `validateNode`) to validation.

### Events and upcaster

```ts
export interface NodeCreated {
  readonly type: 'NodeCreated';
  readonly eventId: EventId;
  readonly id: NodeId;
  readonly shapeId?: ShapeId | undefined;
  readonly properties: PropertyMap;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: BatchId | undefined;
  readonly migrationId?: string | undefined;
}
// EdgeCreated: edgeType -> shapeId?: ShapeId | undefined; all events: batchId?: BatchId | undefined
```

The read-side decoder and upcaster live in `packages/graph/src/event-upcast.ts`:

```ts
export type EventDecodeError = Readonly<{
  code: 'INVALID_EVENT_SHAPE' | 'CONFLICTING_LEGACY_FIELDS';
  message: string;
  details?: unknown | undefined;
}>;

export interface UpcastOptions {
  readonly remapRetiredMetaShapes?: boolean | undefined; // false in bead a; true from bead b onward
}

/** Pure, idempotent, stateless. Never throws. Runs on raw decoded objects or structured clones. */
export function upcastStoredEvent(raw: unknown, options?: UpcastOptions | undefined): unknown;
/** Checks dual-field conflicts before upcastStoredEvent, skips retired meta-node events as ok(null), then validates via GraphEventSchema.safeParse. */
export function decodeStoredEvent(
  raw: unknown,
  options?: UpcastOptions | undefined,
): Result<GraphEvent | null, EventDecodeError>;
```

Helper `withDefaultProperty(props, key, value)` injects defaults safely for both plain records and IndexedDB structured-cloned `Map` instances (`props instanceof Map ? (props.has(key) ? props : new Map([...props, [key, value]])) : ...`).
It never spreads a `Map` into an object literal.

`decodeStoredEvent` runs steps 1–3 before invoking `upcastStoredEvent`, and `upcastStoredEvent` executes steps 4–10 (pure, zero throws under `functional/no-throw-statements`):

| Step | Owner | Input condition | Action |
| :--- | :--- | :--- | :--- |
| 1 | `decodeStoredEvent` | Non-object or `null` input | Pass through to `GraphEventSchema.safeParse` (`INVALID_EVENT_SHAPE`). |
| 2 | `decodeStoredEvent` | Both `'shapeId' in raw` and legacy key (`nodeType` on `NodeCreated`, `edgeType` on `EdgeCreated`) present | If `shapeId !== undefined` and `legacyType !== undefined` and (`legacyType === 'canopy:open'` or `legacyType !== shapeId`), return `err({ code: 'CONFLICTING_LEGACY_FIELDS', ... })`; otherwise pass through (including explicit `undefined` values) to upcast to strip the legacy key. |
| 3 | `decodeStoredEvent` (when `remapRetiredMetaShapes: true`) | `NodeCreated`, `NodePropertiesUpdated`, or `NodeDeleted` whose own `id` is `'node:type:node-type'` or `'node:type:edge-type'` | Return `ok(null)` to skip retired meta-node lifecycle events, because `createGraph()` / `bootstrap()` always supplies `'node:type:shape'`. |
| 4 | `upcastStoredEvent` | `NodeCreated` with `nodeType === 'canopy:open'` | Delete `nodeType`; ensure `shapeId` is omitted. |
| 5 | `upcastStoredEvent` (when `remapRetiredMetaShapes: true`) | `NodeCreated` with `(nodeType ?? shapeId)` equal to `'node:type:node-type'` or `'node:type:edge-type'` | Delete `nodeType` if present, set `shapeId: 'node:type:shape'`, inject `entityKind: 'node'` or `'edge'` if absent (catches Bead-`a` new-form events too). |
| 6 | `upcastStoredEvent` | `NodeCreated` with any other `nodeType: X` | Delete `nodeType`; set `shapeId: X`. |
| 7 | `upcastStoredEvent` | `EdgeCreated` with `edgeType === 'canopy:open'` | Delete `edgeType`; ensure `shapeId` is omitted. |
| 8 | `upcastStoredEvent` | `EdgeCreated` with any other `edgeType: X` | Delete `edgeType`; set `shapeId: X`. |
| 9 | `upcastStoredEvent` (when `remapRetiredMetaShapes: true`) | `EdgeCreated` with `source` or `target` equal to `'node:type:node-type'` or `'node:type:edge-type'` | Remap that endpoint ID to `'node:type:shape'`. |
| 10 | `upcastStoredEvent` | Event already in new form | Return unchanged. |

Why Step 3 returns `ok(null)` instead of remapping `id` to `'node:type:shape'`: remapping both `'node:type:node-type'` and `'node:type:edge-type'` creates duplicate `NodeCreated` collisions in `projectGraph` (`history.ts:93`) against each other and `createGraph()` bootstrap, and remapping `NodeDeleted` would delete `SHAPE`.
Storage adapters filter out `null` decoded events.
Bead `a` defaults `remapRetiredMetaShapes` to `false` while `SYSTEM_IDS.NODE_TYPE` and `SYSTEM_IDS.EDGE_TYPE` stay in bootstrap; Bead `b` flips the default to `true` when `SYSTEM_IDS.SHAPE` replaces them.
The upcaster does not rename property keys inside `properties` (`sourceTypes`, `targetTypes`, `validOutgoingEdges`, `validIncomingEdges`, `targetTypeId`), because a later `NodePropertiesUpdated` cannot identify a legacy definition without state.
Shape and PropertyType readers accept these legacy keys.

Adapter placement and persistence safety:

- All `EventLogStore` implementations (`storage` `createInMemoryEventStore`, `storage-file`, `storage-sqlite`, `storage-http`, `storage-indexeddb`, and `canopy-v0-server.ts` `createEmbeddedEventLogStore`) decode via `decodeStoredEvent`.
- `storage-file` decodes via `decodeStoredEvent` inside `deserializeEvent` (`file-event-log.ts:96`), which is called by both local `readSegmentEvents` (`:382`) and `readRemoteSegmentEvents` (`:886`).
  Remove the redundant second `GraphEventSchema.parse` at `syncRemoteDevice` (`file-event-log.ts:530`).
- Before decoding, `storage-file` (`file-event-log.ts:439-462`) checks raw parsed JSON lines of `activeSegment` for legacy markers (`'nodeType' in raw || 'edgeType' in raw` or retired meta-node IDs); if found, it appends `activeSegment` directly to `manifest.sealed` without adding it to `filesToWrite` (leaving legacy segment files untouched on disk) and writes incoming events to a fresh active segment.
- `storage-indexeddb` (`indexeddb-event-log.ts:106-112`) computes `lowerKey = options.after ?? ''` (`lowerOpen = options.after !== undefined`) and `upperKey = options.before ?? MAX_EVENT_ID` (`upperOpen = options.before !== undefined`), returns `ok([])` when `lowerKey > upperKey || (lowerKey === upperKey && (lowerOpen || upperOpen))` (preventing `DataError` on `after >= before`, `before === ''`, or `after >= MAX_EVENT_ID`), narrows `IDBKeyRange.bound(lowerKey, upperKey, lowerOpen, upperOpen)`, applies `options.reverse`, then decodes via `decodeStoredEvent` skipping `null` entries until `options.limit` valid events are collected when `options.limit !== undefined && options.limit >= 0` (so retired meta-node skips never under-fill `limit`).
- Storage suites audit non-UUID fixture IDs (including `apps/web/src/plugin/mock/guest.ts:101,111`, `apps/web/src/test/seed-vault.ts:22,34`, and `apps/web/src/test/generators/graph-generators.ts:315,319`), share one legacy-log conformance test across every adapter, and verify replay load-test budgets (`sqlite-replay.load.test.ts` 50k replay `<5000ms`, `indexeddb-replay.load.test.ts:110` 50k replay `<5000ms`, and `indexeddb-replay.load.test.ts:140` 500-event cursor `<1500ms`) in Bead `a`.

### Indexes and ReadModelPort

To avoid an `O(N_open)` `Set`-clone cliff and sentinel collisions in `packages/graph/src/indexes.ts`:

- Omit open nodes (`node.shape === undefined`) from `typeIndex: ReadonlyMap<ShapeId, ReadonlySet<NodeId>>`.
  `ReadModelPort.typedNodeIds(shape: ShapeId)` queries shaped nodes only.
- Key `adjacencyOut` and `adjacencyIn` inner maps by `ShapeId | null`, where `null` represents open edges (`edge.shape === undefined`).
- `ReadModelPort.neighbours(nodeId, edgeShape: ShapeId | null | undefined, direction)` distinguishes `undefined` (any edge), `null` (open edges only), and a `ShapeId` (matching edge shape).
- `ReadModelPort.nodesWhereEquals(property, value, shape?: ShapeId | undefined)` indexes scalar properties of both open and shaped nodes, so `nodesWhereEquals('uri', canonicalUri, SYSTEM_IDS.PROXY)` runs in O(1) after index build.
- `canonicalizeReadModelIndexes` (`indexes.ts:741-762`) sorts `null` keys explicitly before string keys (without relying on `'\0'` under `localeCompare`) and tags serialized map keys (`key === null ? 'null' : 's:' + key`) so no `ShapeId` string collides.
- `packages/graph/scripts/bench-index-maintenance.ts` adds a 50%-open-node workload alongside shaped nodes.

### Shape model and queries

One meta-type node, `SYSTEM_IDS.SHAPE = asShapeId('node:type:shape')`, replaces `NODE_TYPE` and `EDGE_TYPE`.
Shape instance nodes have `shape: 'node:type:shape'` and these properties:

| Property | Kind | Notes |
| :--- | :--- | :--- |
| `name`, `namespace`, `description`, `status` | existing | `status` defaults to `'active'`. |
| `entityKind` | text enum | `'node'` or `'edge'`; required on new Shapes. |
| `closed` | boolean | Default `false`. |
| `properties` | text (JSON) | `ShapePropertyBinding[]`; JSON array encoding unchanged. |
| `schemaOrgUri` | url | Optional. |
| `validOutgoingEdges`, `validIncomingEdges` | list/text | Node Shapes only; produce warnings. |
| `sourceTypes`, `targetTypes` | list/text | Edge Shapes only; values are `ShapeId`s; produce warnings. |
| `transitive`, `inverse` | boolean/reference | Edge Shapes only. |

```ts
export interface NodeShapeExtras {
  readonly validOutgoingEdges: readonly ShapeId[];
  readonly validIncomingEdges: readonly ShapeId[];
}

export interface EdgeShapeExtras {
  readonly sourceTypes: readonly ShapeId[];
  readonly targetTypes: readonly ShapeId[];
  readonly transitive: boolean;
  readonly inverse?: ShapeId | undefined;
}

export interface ShapeDefinition {
  readonly id: ShapeId;
  readonly name: string;
  readonly namespace: Namespace;
  readonly description?: string | undefined;
  readonly entityKind: 'node' | 'edge';
  readonly closed: boolean;
  readonly properties: readonly ShapePropertyBinding[];
  readonly schemaOrgUri?: string | undefined;
  readonly status: 'active' | 'inactive';
  readonly node?: NodeShapeExtras | undefined;
  readonly edge?: EdgeShapeExtras | undefined;
}

export type ShapePropertyBinding =
  | Readonly<{
      kind: 'reference';
      name: string;
      required: boolean;
      propertyTypeId: PropertyTypeId;
      cardinality?: 'one' | 'many' | undefined; // may narrow many -> one, never widen one -> many
      description?: string | undefined;
    }>
  | Readonly<{
      kind: 'inline';
      definition: PropertyDefinition;
    }>;
```

- `ShapePropertyBindingSchema` parses the stored `properties` JSON array.
  A legacy flat `PropertyDefinition` object decodes to `{ kind: 'inline', definition }`.
  `NodeTypeDefinition` and `EdgeTypeDefinition` are removed in Bead `b` in favor of `ShapeDefinition`.
- System IDs keep every existing string value: `node:type:node-type` and `node:type:edge-type` are removed from bootstrap in Bead `b`; all `node:type:*`, `system:nodetype:*`, and `meta:renderer` become node Shapes (`entityKind: 'node'`); all `system:edgetype:*` and `edge:type:*` become edge Shapes (`entityKind: 'edge'`).
  `SYSTEM_EDGE_TYPES` renames to `SYSTEM_EDGE_SHAPES`.
- `packages/graph/src/queries.ts` updates:
  - `getShapes(graph, entityKind?: 'node' | 'edge' | undefined): readonly Node[]`
  - `getShape(graph, shapeId: ShapeId): Node | undefined` (ID-only lookup; removes name fallback)
  - `findShapeByName(graph, name: string, entityKind: 'node' | 'edge'): Node | undefined` (for `type-authoring.ts` duplicate-name checks)
  - `resolveShape(graph, shapeId: ShapeId): Result<ShapeDefinition, ShapeResolveError>` where `ShapeResolveError` is `Readonly<{ code: 'SHAPE_NOT_FOUND' | 'SHAPE_KIND_MISMATCH' | 'SHAPE_MALFORMED'; message: string }>`
  - `getNodesOfShape(graph, shapeId: ShapeId)`, `getEdgesOfShape(graph, shapeId: ShapeId)`
  - `getEdgesFrom(graph, nodeId: NodeId, edgeShape?: ShapeId | null | undefined)`
  - `findInverseEdgeShape(graph, edgeShapeId: ShapeId): Result<Node | undefined, Error>` (checks `node.shape === SYSTEM_IDS.SHAPE && node.properties.get('entityKind') === 'edge'` on both source and inverse nodes)
- `packages/graph/src/ops/type-authoring.ts` consolidates `createNodeType` and `createEdgeType` into `createShape(graph, input: CreateShapeInput, options)`:
  - `ShapePropertyInput`:
    ```ts
    export type ShapePropertyInput =
      | Readonly<{
          kind: 'inline';
          name: string;
          valueKind: PropertyValueKind;
          required: boolean;
          description?: string | undefined;
          regex?: string | undefined;
          min?: number | undefined;
          max?: number | undefined;
          choices?: readonly string[] | undefined;
          nullable?: boolean | undefined;
          cardinality?: 'one' | 'many' | undefined;
          unique?: boolean | undefined;
          targetShapeId?: ShapeId | undefined;
          schemaOrgUri?: string | undefined;
        }>
      | Readonly<{
          kind: 'reference';
          propertyTypeId: PropertyTypeId;
          required: boolean;
          name?: string | undefined; // defaults to referenced PropertyType name; set explicitly to bind one PropertyType twice
          cardinality?: 'one' | 'many' | undefined;
          description?: string | undefined;
        }>;
    ```
  - `CreateShapeInput` accepts `name`, `namespace`, `entityKind: 'node' | 'edge'`, `closed?: boolean | undefined` (defaults `false`), `description?: string | undefined`, `schemaOrgUri?: string | undefined`, `properties: readonly ShapePropertyInput[]`, `validOutgoingEdges?: readonly ShapeId[] | undefined`, `validIncomingEdges?: readonly ShapeId[] | undefined`, `sourceTypes?: readonly ShapeId[] | undefined`, `targetTypes?: readonly ShapeId[] | undefined`, `transitive?: boolean | undefined`, `inverse?: ShapeId | undefined`.
  - `createShape` stores durable `{ kind: 'reference', ... }` and `{ kind: 'inline', definition }` entries instead of flattening references, rejects `valueKind === 'list'` on new authoring with `code: 'CONSTRAINT'` (`text` + `cardinality: 'many'` is the canonical replacement), runs `generateDefaultView` only when `entityKind === 'node'` (reading binding names from both `reference` and `inline` bindings), and returns `ValidationError` with `severity: 'error'` and `code` (`SHAPE_MALFORMED`, `PROPERTY_TYPE_NOT_FOUND`, `PROPERTY_TYPE_MALFORMED`, `CARDINALITY_WIDENED`, or `CONSTRAINT`).
  - `createNamespace` returns `ValidationError` with `code: 'CONSTRAINT'`, and `CreatePropertyTypeInput` adds `unique?: boolean | undefined`, `nullable?: boolean | undefined`, `targetShapeId?: ShapeId | undefined`, and `schemaOrgUri?: string | undefined`.
  - `createPropertyType` rejects `valueKind === 'list'` on new authoring (`code: 'CONSTRAINT'`) and returns `ValidationError` with `code: 'PROPERTY_TYPE_MALFORMED' | 'CONSTRAINT'`.

### Flat PropertyType model and URL safety

`packages/graph/src/properties.ts` extends `PropertyDefinition` in place:

```ts
export const PROPERTY_VALUE_KINDS = [
  'text',
  'integer',
  'number',
  'boolean',
  'instant',
  'plain-date',
  'url',
  'reference',
  'external-reference',
  'list', // legacy read compatibility; excluded from new authoring and TypeSpec
] as const;

export interface PropertyDefinition {
  readonly name: string;
  readonly valueKind: PropertyValueKind;
  readonly required: boolean;
  readonly description: string | undefined;
  readonly regex?: string | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly choices?: readonly string[] | undefined;
  readonly nullable?: boolean | undefined;
  readonly cardinality?: 'one' | 'many' | undefined;
  readonly unique?: boolean | undefined;
  readonly targetShapeId?: ShapeId | undefined;
  readonly targetTypeId?: ShapeId | undefined; // legacy read alias
  readonly schemaOrgUri?: string | undefined;
}
```

- `PropertyDefinitionSchema` rejects `unique: true` unless `cardinality === 'many'`, rejects `targetShapeId` / `targetTypeId` unless `valueKind === 'reference'`, and normalizes `targetShapeId: value.targetShapeId ?? value.targetTypeId`.
- `PropertyType` nodes store flat properties without a `required` field (which belongs to `ShapePropertyBinding`) and store `choices` as a JSON array string (`type-authoring.ts:472`).
- Shared helper `validatePropertyConstraints(definition)` checks ReDoS-safe `regex` and `canonicalizeUri` on `schemaOrgUri`, and shared `extractPropertyTypeDefinition(node): Result<PropertyDefinition, readonly ValidationError[]>` in `validation.ts` normalizes `PropertyType` nodes (defaults `required: false`, parses `choices` from `string[]` or JSON string via `parseChoices`, resolves `targetShapeId ?? targetTypeId`, validates `PropertyDefinitionSchema` and `validatePropertyConstraints`).
  Rule 5, Rule 16 (both `PropertyType` nodes and inline `Shape.properties` bindings), `validatePropertyByType`, and `canopy-v0-server.ts` `extractPropertyTypesFromGraph` all share these helpers.
- Mapping to the six target types:
  - `Timestamp`: `valueKind: 'instant'`, `cardinality: 'one'` (`InstantSchema`, ISO 8601 with offset).
  - `NonNegativeInt`: `valueKind: 'integer'`, `cardinality: 'one'`, `min: 0` (`Number.isSafeInteger(v) && v >= 0`).
  - `URL`: `valueKind: 'url'`, `cardinality: 'one'`.
  - `Enum`: `valueKind: 'text'`, `cardinality: 'one'`, `choices: [...]` (closed membership).
  - `Set<Label>`: `valueKind: 'text'`, `cardinality: 'many'`, `unique: true`, optional `choices`.
  - `Ref<Shape>`: `valueKind: 'reference'`, `cardinality: 'one' | 'many'`, `targetShapeId`.
- `canopy-v0-server.ts` renames `scalarKind` to `valueKind`, matching the kernel property name, and populates `constraints`.

`packages/graph/src/url.ts` implements pure `canonicalizeUri(raw: string): Result<string, UriError>` without `try`/`catch` (using `URL.canParse` / `fromThrowable` per `functional/no-try-statements`):

- `UriError` is `Readonly<{ code: 'INVALID_URL' | 'DISALLOWED_SCHEME' | 'EMBEDDED_CREDENTIALS' | 'URI_TOO_LONG'; message: string }>`.
- Trims whitespace, enforces length `<= 8192`, parses as an absolute WHATWG URL, allowlists schemes `['http:', 'https:', 'canopy:', 'mailto:']` (rejects `javascript:`, `data:`, `file:`, `vbscript:`, `blob:`), rejects non-empty `username` or `password`, and strips trailing empty `?` or `#` on the serialized string without mutating `URL` fields (`functional/immutable-data`).

### Validation rules

`ValidationError` in `packages/graph/src/validation-types.ts` is extended in place; `ValidationResult` gains `warnings`:

```ts
export type ValidationSeverity = 'error' | 'warning';
export type ValidationCode =
  | 'SHAPE_NOT_FOUND'
  | 'SHAPE_KIND_MISMATCH'
  | 'SHAPE_INACTIVE'
  | 'SHAPE_MALFORMED'
  | 'PROPERTY_TYPE_NOT_FOUND'
  | 'PROPERTY_TYPE_MALFORMED'
  | 'CARDINALITY_WIDENED'
  | 'REQUIRED_MISSING'
  | 'UNDECLARED_PROPERTY'
  | 'VALUE_KIND'
  | 'CARDINALITY'
  | 'CONSTRAINT'
  | 'DUPLICATE_VALUE'
  | 'REF_TARGET'
  | 'EDGE_ENDPOINT_SHAPE'
  | 'EDGE_NOT_ALLOWED'
  | 'PLUGIN';

export interface ValidationError {
  readonly code: ValidationCode;
  readonly severity: ValidationSeverity;
  readonly entityKind?: 'node' | 'edge' | undefined;
  readonly entityId?: NodeId | EdgeId | undefined;
  readonly path: readonly string[];
  readonly message: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
}

export interface ValidationResult {
  readonly valid: boolean; // errors.length === 0
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationError[];
}
```

`entityKind` and `entityId` are optional so entity-less helpers (`plugin-validation.ts`, `type-authoring.ts`, `validatePropertyByType`, `packages/queries/src/cypher.ts`) share `ValidationError`.
`validateNode(graph, node, mode: 'create' | 'update' = 'create', previousNode?: Node | undefined)` and `validateEdge(graph, edge, mode: 'create' | 'update' = 'create')` stamp `entityKind` and `entityId` on all issues they return.

| # | Condition | Code | Severity |
| :- | :--- | :--- | :--- |
| 1 | Entity is open (`shape === undefined`) | (skip shape rules) | n/a |
| 2 | Referenced Shape node missing | `SHAPE_NOT_FOUND` | error |
| 3 | Shape node lacks `shape === SYSTEM_IDS.SHAPE` or `entityKind` mismatches | `SHAPE_KIND_MISMATCH` | error |
| 4 | Shape `status === 'inactive'` | `SHAPE_INACTIVE` | error on `create`; warning on `update` |
| 5 | Reference binding points to missing or malformed `PropertyType` node | `PROPERTY_TYPE_NOT_FOUND` / `PROPERTY_TYPE_MALFORMED` | error |
| 6 | Reference binding widens `PropertyType` cardinality (`one` to `many`) | `CARDINALITY_WIDENED` | error |
| 7 | Required binding has no value (`undefined`), or `null` when `nullable !== true` | `REQUIRED_MISSING` | error |
| 8 | `closed === true` and property key has no binding | `UNDECLARED_PROPERTY` | error |
| 9 | `closed === false` and property key has no binding | (allowed) | n/a |
| 10 | Value kind or cardinality mismatch (array length capped at 10,000 items) | `VALUE_KIND` / `CARDINALITY` | error |
| 11 | Constraint fails (`min`, `max`, `regex`, `choices`, integer, finite number, URL, instant, plain-date) | `CONSTRAINT` | error |
| 12 | `unique === true` and duplicate scalar item (via `serializeScalarForIndex`) | `DUPLICATE_VALUE` | error |
| 13 | `reference` target missing in `graph.nodes`, or `target.shape !== targetShapeId` | `REF_TARGET` | error |
| 14 | Edge endpoint shape not in `sourceTypes`/`targetTypes`, or edge shape not in node `validOutgoingEdges`/`validIncomingEdges` | `EDGE_ENDPOINT_SHAPE` / `EDGE_NOT_ALLOWED` | warning |
| 15 | `SYSTEM_IDS.TYPE_PLUGIN` wasm/manifest checks (exempts `isSystemNodeId` with placeholder `wasm_binary: ''`) | `PLUGIN` | error |
| 16 | Meta self-validation on `SYSTEM_IDS.SHAPE` (`ShapePropertyBindingSchema`, `validatePropertyConstraints` on inline bindings, `entityKind`, immutable `entityKind` vs `previousNode` on `update`, `url` on `schemaOrgUri`) and `SYSTEM_IDS.PROPERTY_TYPE` (`extractPropertyTypeDefinition`) | `SHAPE_MALFORMED` / `PROPERTY_TYPE_MALFORMED` | error |

Exact edge-case rules:

- Rule 6 effective `PropertyType` cardinality is `pt.cardinality ?? (pt.valueKind === 'list' ? 'many' : 'one')`; when `binding.cardinality` is omitted, the binding inherits that effective cardinality.
- `number`: `typeof v === 'number' && Number.isFinite(v)` (rejects `NaN` and `Infinity`).
- `integer`: `typeof v === 'number' && Number.isSafeInteger(v)`.
- `instant`: `InstantSchema.safeParse(v).success`.
- `plain-date`: `parsePlainDate(v).ok` (`factories.ts:78`).
- `url`: `canonicalizeUri(v).ok`.
- `external-reference`: `isExternalReferenceValue(v)` and `GraphIdSchema.safeParse(v.graph).success && NodeIdSchema.safeParse(v.target).success`.
- `list` (legacy): array of any valid `ScalarValue`; `min`/`max` check array length (fixing `validation.ts:388` `expected: '<= ${limit}'`).
- `cardinality: 'many'` (non-`list`): `min`/`max`, `regex`, `choices`, and `targetShapeId` apply per array element; `null` elements fail unless `nullable === true`.
- `nullable: true`: `null` satisfies `required: true` and skips scalar/constraint checks.
- ReDoS guard: value length `<= 8192`, regex pattern length `<= 256`, and reject nested quantifier patterns (such as `(a+)+`, `(a*)*`, `(a+)*`).
- `reference` (Rule 13): runs for both nodes and edges, requires target node existence even when `targetShapeId` is unset, and requires `target.shape === targetShapeId` when set.

### Batch commit and sessions

```ts
export type CommitError =
  | Readonly<{ kind: 'validation'; message: string; batchId: BatchId; errors: readonly ValidationError[] }>
  | Readonly<{ kind: 'projection'; message: string; batchId: BatchId }>
  | Readonly<{ kind: 'batch'; message: string }>
  | Readonly<{ kind: 'system-node'; message: string; nodeId: NodeId }>
  | Readonly<{ kind: 'storage'; message: string; cause: Error }>;

export interface CommitSuccess {
  readonly graph: Graph;
  readonly batchId: BatchId;
  readonly events: readonly GraphEvent[];
  readonly warnings: readonly ValidationError[];
}
```

`GraphSession.commit(events)` rules:

1. Serialize all `load` and `commit` calls inside `createGraphSession` through a per-session promise queue so validate, append, merge, and notify never interleave across `await`.
   Serialize `storage-file` `appendEvents` and `reconcile` (`:820`) on one per-store queue via an internal unqueued `appendEventsInternal` helper (avoiding reentrant deadlock and manifest races) with unique temp filenames (`${filePath}.${crypto.randomUUID()}.tmp`).
   In `canopy-v0-server.ts`, wrap every per-`graphId` mutator (`createGraph`, `deleteGraph`, `handleCommitTransaction`, `handleCreateDraft`, `handleStageDraftOperations`, `handleCommitDraft`, `handleDiscardDraft`, `installBundle`, and any write handler reading/writing `registry`) in one per-`graphId` lock (`withGraphWriteLock`) covering `registry` read -> precondition -> `session.commit` -> `registry` write.
2. If `events.length === 0`, return `ok({ graph: currentGraphCell.current, batchId: createBatchId(), events: [], warnings: [] })` with no append or notify.
   In `canopy-v0-server.ts`, reject `request.batchId === ''` with `VALIDATION_ERROR`, and echo a valid caller `request.batchId` when `operations.length === 0`.
3. Validate `batchId` across `events`: reject empty strings (`batchId === ''`) or 2+ distinct IDs with `kind: 'batch'`; use the single present `batchId` or call `createBatchId()`.
4. Stamp `deviceId` and `batchId` on every event.
5. Run shared `validateBatch(graph, stamped)`:
   - Reject `NodeDeleted` on `isSystemNodeId(event.id)` with `kind: 'system-node'`.
   - Run dry-run `projectGraph(stamped, { ...graph, _indexes: undefined })` (skipping unnecessary index clones) to reject duplicate IDs and dangling references (`kind: 'projection'`).
   - Collect all errors and warnings across every touched node and edge (passing `mode: 'create'` when the entity did not exist in pre-commit `graph`, else `'update'` with `previousNode = graph.nodes.get(id)`); `NodeDeleted` and `EdgeDeleted` never trigger shape validation.
   - On any error, return `kind: 'validation'` with all errors and append nothing.
6. Append to `EventLogStore`, merge via `mergeEvents`, notify subscribers, and return `CommitSuccess` with stamped `events` and `warnings`.

Intra-batch causal ordering and `DraftSession`:

- Extract one shared causal batch comparator `sortEventsCausally(events)` used by both `projectGraph` (`projection.ts`) and `attemptGroup` (`incremental-projection.ts`).
  Group by `batchId` (using each batch's minimum `eventId` as group anchor, and `eventId` itself when `batchId === undefined`) and sort by `(anchorEventId, causalRank, eventId)`, where `causalRank` orders `NodeCreated` (0), `EdgeCreated` (1), updates and workflow events (2), `EdgeDeleted` (3), and `NodeDeleted` (4).
  This prevents `EdgeCreated.eventId < NodeCreated.eventId` inside one batch from failing `projectGraph` or tombstoning edges in `mergeEvents`.
- `DraftSession.applyEvents` shares `validateBatch` (removing duplicate `validateDraftEvents` from `incremental-projection.ts`), `draft-session.ts:83-86` maps non-storage `CommitError` variants to `{ type: 'validation-failure', message }`, and `draft-session.ts:117` guards `node.shape?.toLowerCase().includes(query)`.
- `CommitError.kind` maps to `GraphAccessErrorCategory`: `'validation' | 'batch' | 'projection'` -> `'VALIDATION_ERROR'`, `'system-node'` -> `'FORBIDDEN'`, `'storage'` -> `'INTERNAL_ERROR'`.

### Bootstrap changes

- Replace `NODE_TYPE` and `EDGE_TYPE` (`NODE_TYPE_DEF` and `EDGE_TYPE_DEF`) with `SYSTEM_IDS.SHAPE = asShapeId('node:type:shape')`, `SYSTEM_IDS.SHAPE_DEF = asNodeId('node:type:shape')`, and `shapeProperties`.
- `shapeProperties` adds `status`, `entityKind`, `closed`, and `schemaOrgUri`.
- `propertyTypeProperties` adds `namespace`, `unique`, `nullable`, `targetShapeId`, and `schemaOrgUri`.
- All 7 meta-Shapes created in `bootstrap.ts:96-234` (`SHAPE_DEF`, `RENDERER_DEF`, `NAMESPACE_DEF`, `PROPERTY_TYPE_DEF`, `QUERY_DEFINITION_DEF`, `VIEW_DEFINITION_DEF`, `TEMPLATE_DEF`) AND all `coreNodeTypes`/`coreEdgeTypes` receive `entityKind` and `closed: false`.
- `SettingsSchema.scopes` (`bootstrap-definitions.ts:276-280,545,554`, `bootstrap.ts:373`) stores real string arrays (`['node', 'type', 'namespace', 'global']`, `['global']`) instead of JSON strings, matching `permissions`.
- Add 1 system PropertyType and 6 minimal `closed: false` Shapes:
  - `SYSTEM_IDS.PROPERTY_TYPE_URL = asPropertyTypeId('system:propertytype:url')` (`name: 'URL'`, `namespace: 'system'`, `valueKind: 'url'`, `cardinality: 'one'`).
  - `SYSTEM_EDGE_SHAPES.DERIVED_FROM = asShapeId('system:edgetype:derived-from')` (`entityKind: 'edge'`; optional `reason` text, optional `actor` text).
  - `SYSTEM_EDGE_SHAPES.SUPERSEDES = asShapeId('system:edgetype:supersedes')` (`entityKind: 'edge'`; optional `reason` text).
  - `SYSTEM_IDS.PROXY = asShapeId('system:nodetype:proxy')` (`entityKind: 'node'`; required `uri` bound to `SYSTEM_IDS.PROPERTY_TYPE_URL`, optional `title` text).
  - `SYSTEM_IDS.SHAPE_MIGRATION = asShapeId('system:nodetype:shape-migration')` (`entityKind: 'node'`; `closed: false`, matching `canopy-v0-server.ts:521`).
  - `SYSTEM_IDS.BUNDLE = asShapeId('system:nodetype:bundle')` (`entityKind: 'node'`; `closed: false`, matching `canopy-v0-server.ts:1669`).
  - `SYSTEM_EDGE_SHAPES.RENDER_SELECTOR = asShapeId('system:edgetype:render-selector')` (`entityKind: 'edge'`; `closed: false`, matching `canopy-v0-server.ts:168`).
- `packages/queries/tests/fixtures/query-benchmark-fixture.ts` seeds `benchmark:Node` (`entityKind: 'node'`) and `benchmark:Edge` (`entityKind: 'edge'`) Shape nodes in BOTH `fixture.graph` and `fixture.events` (`NodeCreated` events), so `benchSingleCommit` and `benchBatchCommit` in `bench-query-projection.ts:90,120` pass Rule 2 and typed scans stay non-empty.
- `apps/web/src/test/generators/` fixes mismatched `'system:node-type:*'` fixture IDs and `graph-session.test.ts` updates `'test-type'` fixtures to open nodes or seeded Shape nodes so tests pass Rule 2.

### TypeSpec, WIT, and downstream updates

In `packages/graph-access/typespec/main.tsp` (using compiler-supported `float64`, `int32`, `string`, `boolean`, and `T[]` per `tools/lib/typespec-compiler.ts:114,692-700`):

- `CanopyV0EdgeRecord.shapeId` becomes `shapeId?: ShapeId;`.
- `CanopyV0BatchOperation` removes `edgeTypeId` and uses optional `shapeId?: ShapeId` for `create-edge` (`canopy-v0-server.ts:441` stops requiring `edgeTypeId`).
- `enum CanopyV0PropertyValueKind` uses kebab-case wire values matching `PROPERTY_VALUE_KINDS` (excluding `'list'`):
  `text: "text"`, `integer: "integer"`, `number: "number"`, `boolean: "boolean"`, `instant: "instant"`, `plainDate: "plain-date"`, `url: "url"`, `reference: "reference"`, `externalReference: "external-reference"`.
- Replace `CanopyV0PropertyTypeRecord.scalarKind` with `valueKind: CanopyV0PropertyValueKind` and add `constraints?: CanopyV0PropertyConstraints`.
- Add `CanopyV0PropertyConstraints` (`min?: float64`, `max?: float64`, `regex?: string`, `choices?: string[]`, `unique?: boolean`, `targetShapeId?: ShapeId`, `nullable?: boolean`) and `CanopyV0InlinePropertySpec` (`valueKind: CanopyV0PropertyValueKind`, `constraints?: CanopyV0PropertyConstraints`, `schemaOrgUri?: string`).
- In response-only `CanopyV0ShapePropertyBinding` (used by `CanopyV0ShapeRecord`), make `cardinality?: CanopyV0PropertyCardinality` optional (omitted only when a dangling reference binding fails `PropertyType` resolution) and add `inline?: CanopyV0InlinePropertySpec`; `extractShapeRecordsFromGraph` maps `{ kind: 'reference' }` bindings to `{ key, propertyTypeId, required, cardinality }` and `{ kind: 'inline' }` bindings to `{ key, required, cardinality, inline }`.
- Legacy `'list'` boundary mapping: `extractShapeRecordsFromGraph` and `extractPropertyTypesFromGraph` map `valueKind === 'list'` to `{ valueKind: 'text', cardinality: 'many' }` across the TypeSpec boundary, and `extractPropertyTypesFromGraph` skips malformed `PropertyType` nodes when `extractPropertyTypeDefinition` returns `err`.
- Add `CanopyV0ValidationSeverity` (`error`, `warning`) and `CanopyV0ValidationIssue` (`code: string`, `severity: CanopyV0ValidationSeverity`, `entityKind?: CanopyV0EntityKind`, `entityId?: string`, `path: string[]`, `message: string`, `expected?: string`, `actual?: string`).
- `CanopyV0CommitTransactionResponse` (`main.tsp:208`) adds `warnings: CanopyV0ValidationIssue[];`.
- Commit errors return via standard `GraphAccessError` (`result-errors.ts:13-18`) with `details: { batchId?: BatchId | undefined; errors: readonly CanopyV0ValidationIssue[] }` (`errors: []` for non-`validation` `CommitError` kinds).
- In WIT (`main.tsp:654-818`), replace `type type-id = string;` with `type shape-id = string;` in `graph-types` and `draft-session`, and replace `node-type: type-id` with `shape-id: option<shape-id>` on `node-created-event` and `graph-node`.
  In Bead `a`, `apps/web/src/plugin/draft-session-shim.ts:64,86` and `apps/web/src/context/plugin-context.tsx:110,247` adapt to optional `node.shape` / `shapeId`, omitting `shapeId` whenever the WIT `nodeType` equals `'canopy:open'` or `''` (`...(nodeType !== 'canopy:open' && nodeType !== '' && { shapeId: asShapeId(nodeType) })`) so open-node staging works before WIT becomes optional; `apps/web/src/plugin/mock/guest.ts:101,111` updates to UUIDs (regenerating `mock/guest.js` via `bun run codegen:wit`); and `apps/web/scripts/package-plugin.ts:16,83` updates to emit `shape` (regenerating gitignored `markdown/plugin-node.json` and `mock/plugin-node.json` build artifacts via `codegen:wit`).
  In Bead `b`, `apps/web/src/plugin/mock/guest.ts:103` switches to `nodeType: 'canopy:open'` (and `bun run codegen:wit` regenerates `mock/guest.js`) so Rule 2 passes cleanly via Bead `a`'s `'canopy:open'` omission.
  In Bead `d`, `mock/guest.ts` and regenerated `mock/guest.js` omit `shapeId`, and `draft-session-shim.ts:64,86` plus `plugin-context.tsx:247` read/write native optional `shapeId` directly using conditional spread (`...(shapeId !== undefined && { shapeId })` for `exactOptionalPropertyTypes: true`).
- `canopy-v0-server.ts` removes `OPEN_NODE_SHAPE` in Bead `a` (temporary `edge.shape ?? ''` bridge in `toEdgeRecord:255` until Bead `d`), reuses `resolveShape`, `extractPropertyTypeDefinition`, `ShapePropertyBindingSchema`, `SYSTEM_IDS`, and `SYSTEM_EDGE_SHAPES` in Bead `b`, uses `commitResult.value.batchId` (`createBatchId()`) and `commitResult.value.events` in Bead `c`, and in Bead `d` validates `request.canonicalUri` with `canonicalizeUri` (returning `VALIDATION_ERROR` on invalid URI) before calling `createIndexedReadModel(graph).nodesWhereEquals('uri', canonical, SYSTEM_IDS.PROXY)` (`:1339-1353`, auditing existing tests for `'canonicalUri'`/`'url'` expectations).
- `packages/graph-access/src/{graph-access-payloads,mutation-handlers,query-handlers}.ts` become optional-shape (`shape?` / `type?`) in Bead `a` so `tsc -b` compiles cleanly.
- `packages/queries/src/engine.ts` supports `property === 'type' || property === 'shape'` in `getItemFieldValue` (`:377`) and `applyFilter` (`:278-284`); in `applyFilterIndexed` (`:253-272`), routes `property === 'shape' || property === 'type'` with string `value` through `readModel.typedNodeIds(asShapeId(value))` (falling back to `applyFilter` for non-string values); and `QueryStep` (`packages/queries/src/model.ts:22-29`) accepts `step.shape ?? step.type` and `step.edgeShape ?? step.edgeType`.

Regenerate TypeSpec contracts and baselines in Bead `d` with `bun tools/typespec-codegen.ts` (which overwrites `schema-baselines/`), then verify `bun tools/typespec-codegen.ts --check` and `bun tools/check-api-compatibility.ts` pass with zero drift.

## Compatibility and migration

- Persisted logs stay untouched on disk; `decodeStoredEvent` upcasts on read, and `storage-file` seals legacy active segments into `manifest.sealed` before new appends.
- Sync peers must upgrade together before reading new-form events (`shapeId`, no `nodeType`).
- `queries` keep supporting stored `type` filters, sorts, and `QueryStep` fields as aliases of `shape` (open entities return `undefined`).
- Existing `targetTypeId` properties on `PropertyType` nodes and flat `PropertyDefinition` JSON entries decode into the updated schemas.
- Legacy entities whose `shape` ID has no Shape node fail Rule 2 on their next property update; `NodeDeleted` remains allowed so orphaned entities can always be deleted.

## Risks

| Risk | Mitigation |
| :--- | :--- |
| Large rename surface across 8 packages and 2 apps | Pair breaking renames and `commit` signature changes with mechanical caller updates in the same bead; keep deprecated `TypeId` alias until bead d. |
| Index copy cost on open entities | Omit open nodes from `typeIndex`; key adjacency inner maps by `ShapeId \| null`; add a 50%-open workload to `bench-index-maintenance.ts`. |
| Cold-load Zod decode latency in `sqlite` and `indexeddb` | Guard empty/inverted bounds, narrow `IDBKeyRange`, and slice after `null` filtering; verify load budgets (`<5000ms` 50k sqlite and indexeddb, `<1500ms` 500-event indexeddb cursor) in bead a. |
| Dry-run fold clones `_indexes` twice per commit | Strip `_indexes: undefined` before dry-run `projectGraph` inside `validateBatch`. |
| Unserialized concurrent `commit` / `reconcile` races | Serialize `load`/`commit` per `GraphSession`, serialize `appendEvents`/`reconcile` in `storage-file` via `appendEventsInternal`, and serialize all per-`graphId` mutators in `canopy-v0-server.ts` under `withGraphWriteLock`. |
| Function-size and ESLint disable-ceiling limits (`147` baseline, `max-lines-per-function: 100`) | Extract small single-purpose helpers, use `fromThrowable` instead of `try`/`catch`, avoid mutating `URL` fields, and add no new `eslint-disable` comments. |

## Open questions

None.

## Implementation plan

Beads run in order `a` -> `b` -> `c` -> `d`.
Every bead pairs breaking `@canopy/graph` changes with mechanical caller updates so `mise run check` passes across the whole monorepo after each bead.

| Bead | Scope | File ownership | Depends on | Acceptance criteria |
| :--- | :--- | :--- | :--- | :--- |
| **a. Kernel types, upcaster, indexes, and rename sweep** | `ShapeId` and `BatchId` brands (deprecated `TypeId` alias); `Node.shape?`/`Edge.shape?`; `shapeId?` events; `event-upcast.ts` (`nodeType`/`edgeType` -> `shapeId?`, `canopy:open` -> absent; `remapRetiredMetaShapes: false`) wired into all `EventLogStore`s (`storage-file` both sites via `deserializeEvent` + raw legacy seal, `storage-indexeddb` guarded range + post-`null` limit, UUID audit incl. `mock/guest.ts` + regenerated `mock/guest.js`, `seed-vault.ts`, `graph-generators.ts`); omit open nodes from `typeIndex`, `ShapeId \| null` adjacency, tagged `canonicalizeReadModelIndexes`, 50%-open bench; `guards.ts`; `OPEN_NODE_SHAPE` removal in `canopy-v0-server.ts` (temp `edge.shape ?? ''` bridge); optional shape across `graph-access-payloads.ts`/`mutation-handlers.ts`/`query-handlers.ts`, `settings/{cascade,view-resolution}.ts`, `queries/{engine,model,stored,views}.ts` (reuse `isSystemNodeId`), `query-benchmark-fixture.ts` (`asBatchId`), `workflow-engine.ts`, `draft-session-shim.ts:64,86` & `plugin-context.tsx:110,247` (`node.shape ?? ''` out, omit `'canopy:open'`/`''` in), `apps/web/src/utils/node-types.ts:67`, `apps/web/src/context/graph-context.tsx:202,238`, `apps/web/src/components/renderers/block-renderer.tsx`, `apps/web/scripts/package-plugin.ts` (regenerates gitignored `markdown/plugin-node.json` and `mock/plugin-node.json` via `codegen:wit`), `apps/cli`. Keep `NODE_TYPE`/`EDGE_TYPE` operational. | `packages/graph/src/{identifiers,factories,node,edge,schemas,events,event-upcast,guards,indexes,read-model,projection,incremental-projection,queries,event-bus,workflow-engine,resolve-namespace,constructors,bootstrap*,validation,draft-session,index,ops/*}.ts`, `packages/graph/scripts/bench-*.ts`, all `storage-*` adapters, `packages/graph-access/src/{canopy-v0-server,graph-access-payloads,mutation-handlers,query-handlers}.ts`, `packages/queries/{src/{engine,model,stored,views}.ts,tests/fixtures/query-benchmark-fixture.ts}`, `packages/settings/src/{cascade,view-resolution,ops}.ts`, `packages/plugin-host`, `apps/cli`, `apps/web/src/{plugin/{draft-session-shim,mock/guest},utils/node-types,components/renderers/block-renderer,context/{graph-context,plugin-context},test/{seed-vault,generators/graph-generators}}.ts*`, `apps/web/scripts/package-plugin.ts`, regenerated `codegen:wit` build artifacts (`mock/guest.js`, `plugin-node.json`), and other mechanical `.type` callers. | none | `upcastStoredEvent` / `decodeStoredEvent` unit + `fast-check` idempotence/Map tests pass; shared legacy-log conformance test passes across every `EventLogStore`; replay load tests pass within time bounds (`<5000ms` 50k sqlite/indexeddb, `<1500ms` indexeddb cursor); `verifyIndexes` passes on open+shaped graphs; `bench:index-maintenance` (with 50%-open case) and `bench:incremental-projection` recorded vs baseline; `mise run check` green. |
| **b. Shape bootstrap, flat PropertyType, URL safety, and validation** | Export `PropertyTypeId*`; enable `remapRetiredMetaShapes: true` (`node:type:node-type`/`edge-type` skip + `(nodeType ?? shapeId)` remap); unified `SYSTEM_IDS.SHAPE` bootstrap (`shape`, 7 meta-Shapes in `bootstrap.ts:96-234`, `PROPERTY_TYPE_URL`, `DERIVED_FROM`, `SUPERSEDES`, `PROXY`, `SHAPE_MIGRATION`, `BUNDLE`, `RENDER_SELECTOR`, `SettingsSchema.scopes` array fix, `query-benchmark-fixture.ts` `NodeCreated` Shapes in `graph`+`events`, web generator + `graph-session.test.ts` + `mock/guest` updates); `url.ts`; flat `PropertyDefinition` + `ShapeDefinition` + `ShapePropertyBinding` + `extractPropertyTypeDefinition`; `queries.ts` (`resolveShape`, `findShapeByName`, `findInverseEdgeShape`); `type-authoring.ts` (`createShape`, durable `propertyTypeId`, `entityKind === 'node'` default view); `ValidationError`/`ValidationResult` + Rules 1-16 (incl. `previousNode` for `entityKind` immutability) + `plugin-validation.ts`; update all `NODE_TYPE`/`EDGE_TYPE`/`SYSTEM_EDGE_TYPES`/`warnings`/`PROPERTY_VALUE_KINDS` callers (`ops/*`, `indexes.ts`, `resolve-namespace.ts`, `cypher.ts`, `canopy-v0-server.ts`, `apps/web/src/{utils/{node-types,schema},pages/schema-namespace-page,components/{renderers/block-renderer,layout/new-node-dialog,properties/*,schema/*},context/graph-context}.tsx`). | `packages/graph/src/{identifiers,factories,system,bootstrap,bootstrap-definitions,url,properties,definitions,schemas,queries,validation,validation-types,plugin-validation,indexes,resolve-namespace,event-upcast,graph-session.test,ops/{node,edge,blocks,type-authoring}}.ts`, `packages/queries/src/cypher.ts`, `packages/queries/tests/fixtures/query-benchmark-fixture.ts`, `packages/graph-access/src/canopy-v0-server.ts`, `apps/web/src/{utils,pages/schema-namespace-page,components/{renderers,layout,properties,schema},context/graph-context,plugin/mock/{guest.ts,guest.js},test/generators}`, tests. | a | Unit tests cover Rules 1-16 (incl. `entityKind` immutability and inline regex/URL safety) and `canonicalizeUri` scheme/credential rejections; retired meta-node `NodeCreated`/`NodeDeleted` and Bead-`a` Shape replay pass `getGraphAt`; `fast-check` tests cover spec generation, mutations, `closed: false` extras, and warnings; ReDoS tests pass; `bench:index-maintenance` green; `mise run check` green. |
| **c. Serialized batch commit, causal ordering, and DraftSession** | Export `createBatchId`; per-session `load`/`commit` mutex; `CommitSuccess` (with stamped `events`) and `CommitError`; shared `validateBatch` (stripping `_indexes`, `previousNode`, all errors + warnings); unified `sortEventsCausally` in `projection.ts` + `incremental-projection.ts`; `DraftSession` unification (remove `validateDraftEvents`, guard `node.shape?`); `storage-file` serialized `appendEvents`/`reconcile` (`appendEventsInternal`) + unique `.tmp`; `canopy-v0-server.ts` full per-graph `withGraphWriteLock` over all `registry` mutators + `createBatchId()` + `CommitError` mapping; mechanical `commit` caller updates (`mutation-handlers.ts`, `apps/web/src/context/graph-context.tsx`, `bench-query-projection.ts`, tests); Journeys 1-3 integration tests over `storage-file`. | `packages/graph/src/{factories,graph-session,draft-session,projection,incremental-projection,batch-validation,index}.ts`, `packages/storage-file/src/file-event-log.ts`, `packages/graph-access/src/{canopy-v0-server,mutation-handlers}.ts`, `packages/queries/scripts/bench-query-projection.ts`, `apps/web/src/context/graph-context.tsx`, tests. | b | Concurrent `commit`, `deleteGraph`, draft, and `reconcile` race tests pass; commit with N invalid entities returns N errors and appends nothing; all appended events share one `BatchId`; out-of-order intra-batch `EdgeCreated` before `NodeCreated` converges; Journeys 1-3 pass on `storage-file`; `bench:incremental-projection` + `bench:index-maintenance` green; `mise run check` green. |
| **d. TypeSpec, WIT, downstream consumers, and EGM specs** | `main.tsp` edits (`CanopyV0EdgeRecord.shapeId?`, remove `edgeTypeId`, kebab-case `CanopyV0PropertyValueKind`, `CanopyV0PropertyConstraints`, `CanopyV0InlinePropertySpec`, `CanopyV0ValidationIssue`, WIT `shape-id` / `option<shape-id>`) + `bun tools/typespec-codegen.ts` + `check-api-compatibility.ts`; `canopy-v0-server.ts` (remove `edge.shape ?? ''` bridge, optional edge `shapeId`, legacy `'list'` boundary map, `valueKind`/`constraints`, `GraphAccessError.details`, `canonicalizeUri` + `nodesWhereEquals`); `graph-access-payloads.ts` / `mutation-handlers.ts` / `query-handlers.ts` shape naming cleanup; WIT shims (`draft-session-shim.ts`, `guest-types`, `mock/guest.ts` + `mock/guest.js`, `apps/web/src/context/plugin-context.tsx:247`, transpiled shims); `apps/{cli,web}` open-entity UI; remove deprecated `TypeId*` aliases; update every touched `README.md`. | `packages/graph-access/typespec/main.tsp`, `tools/typespec-codegen.ts` outputs, `packages/plugin-host/schema-baselines/*`, `packages/{graph,graph-access,queries,settings,storage-*,plugin-host}`, `apps/{cli,web}`, every touched `README.md`. | c | `typespec-codegen.ts --check` and `check-api-compatibility.ts` pass with zero drift; `TypeId` no longer exported; open edge creation works end-to-end; `bench:query-projection` passes; web e2e and zero EGM drift verified; `mise run check` green. |

Follow-up non-blocking refinement beads under `canopy-anir.3`:

1. Re-evaluate bootstrap Shapes (kernel versus installable bundles) after bead `d`.
2. Refine `Shape` and `PropertyType` lifecycle guards (in-use `NodeDeleted` guard and `SHAPE_INACTIVE` update policy) after bead `b`.

## Verification

- `mise run check` (build, lint, typecheck, test) passes across the whole workspace after each bead `a` through `d`.
- `fast-check` property tests pass for `upcastStoredEvent` (bead `a`) and `PropertyDefinition` validation (bead `b`).
- `@canopy/graph` perf benches (`bench:index-maintenance` with 50%-open workload and `bench:incremental-projection`) stay green in beads `a`, `b` (`bench:index-maintenance`), and `c`; `bench:query-projection` passes in bead `d`.
- Replay load tests (`sqlite-replay.load.test.ts` `<5000ms`, `indexeddb-replay.load.test.ts` `<5000ms` full / `<1500ms` cursor) and shared legacy-log conformance tests pass across all `EventLogStore` adapters.
- Journey 1-3 integration tests pass over `storage-file` in bead `c`, and open edges pass end-to-end through TypeSpec APIs in bead `d`.
- `bun tools/typespec-codegen.ts --check`, `bun tools/check-api-compatibility.ts`, and all touched EGM `README.md` contracts pass with zero drift.
