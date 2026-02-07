# Core data model and type system

> Status: **draft**
> Scope: primitives, identity, events, projection, namespaces, metatypes, storage abstraction
>
> This document is the canonical reference for the foundational data model.
> It supersedes relevant sections of v0.1 and v0.1.1 design docs where conflicts exist.

---

## 1. Primitives

The system has three structural primitives: **node**, **edge**, and **graph**.

### Node

A node is a typed, property-bearing entity with a unique identity.

- **id**: UUIDv7 (time-ordered, globally unique)
- **type**: reference to a NodeType definition (itself a node in the graph)
- **properties**: a map of string keys to typed values
- **created**: Instant (milliseconds since epoch)
- **modified**: Instant (updated on any property change)

Nodes are never mutated in place.
Operations produce events; events produce new graph states.

### Edge

An edge is a typed, directed, property-bearing relationship between two nodes.

- **id**: UUIDv7
- **type**: reference to an EdgeType definition (itself a node in the graph)
- **source**: NodeId
- **target**: NodeId
- **properties**: a map of string keys to typed values
- **created**: Instant
- **modified**: Instant

Edges are first-class.
They carry data (e.g., `position` for ordering, `weight` for relevance).
They are not just pointers.

### Graph

The graph is a collection of nodes and edges.
It is the aggregate root for all operations.

All operations take a graph and return a new graph (plus events).
There is one graph per vault.
Partitioning within the graph is handled by namespaces, not by separate graphs.

> **Open question**: whether the top-level container is called "vault," "universe," or something else is TBD.
> The key property is: one event log, one identity space, one graph.

---

## 2. Identity

All entities use **UUIDv7** identifiers.

UUIDv7 provides global uniqueness without coordination (no central ID server).
It encodes a timestamp, which is useful for event ordering and CRDT resolution.
It is a compact 128-bit representation with broad tooling support.

Identifiers are **branded types** at the TypeScript level (`NodeId`, `EdgeId`, `TypeId`, `EventId`).
This prevents accidental cross-use (passing an EdgeId where a NodeId is expected).

Branding is a TypeScript implementation detail.
The logical model is: IDs are UUIDv7 strings with distinct semantic roles.

---

## 3. Properties

### Current model

PropertyValue is a union of scalar types:

- `string`
- `number`
- `boolean`
- `Instant` (millisecond-precision timestamp)
- `NodeId` (reference to another node)
- `PropertyValue[]` (homogeneous arrays of the above)
- `null`

No nested objects in the current model.
If structure is needed, model it as nodes and edges.

### Future extension

The flat property model is a pragmatic starting point, not an architectural constraint.
The type system should be designed to accommodate structured/object property values in the future.

Specific extension points under consideration:

- Object-typed properties (validated against a property schema)
- User-defined property vocabularies (see section 7)

The PropertyValue union is explicitly extensible.
New value types can be added as the system matures.

---

## 4. Events and projection

### Events are the source of truth

The event log is the canonical data.
The graph is a derived, materialized view.
This is a core conviction, not an implementation detail.

Any graph state can be reconstructed by replaying events from the beginning.
Time-travel queries are a projection to a specific event offset.
Sync between devices is event log merging.
Storage engines are interchangeable because events are portable.

### Event types

Core graph events:

| Event                   | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `NodeCreated`           | A new node was added to the graph                       |
| `NodePropertiesUpdated` | One or more properties on a node changed                |
| `NodeDeleted`           | A node was removed (tombstoned, not physically deleted) |
| `EdgeCreated`           | A new edge was added between two nodes                  |
| `EdgePropertiesUpdated` | One or more properties on an edge changed               |
| `EdgeDeleted`           | An edge was removed                                     |

Each event carries:

- **EventId**: UUIDv7 (for deduplication and ordering)
- **timestamp**: Instant
- **payload**: event-type-specific data

### Migration events

When the system upgrades, **migration events** are emitted into the event log.
An upgrade might add a new system type or modify a type schema.

Migration events are structurally identical to regular events but are tagged with migration metadata (version, migration name).
Migrations are replayable because they are just events.
The event log is a complete history including schema evolution.
No out-of-band migration scripts bypass the event log.

> **Open question**: exact migration event structure and versioning scheme is TBD.
> The principle is established: schema changes are events, not side effects.

### Batch / transaction events

Multiple events that must be applied atomically should be grouped into a batch.
For example, creating a node and its required edges is logically one operation.

> **Open question**: whether this is an `EventBatch` wrapper, a transaction ID on individual events, or another mechanism is TBD.
> The requirement is established: some operations are logically atomic.

### Projection

`projectGraph(events) -> Graph` is a **pure function**.
Given the same events in the same order, it always produces the same graph.

Projection applies each event sequentially, producing a new graph state after each one.
The final graph state is the current view.

The projection target (where the materialized graph lives) is pluggable:

- In-memory (current implementation)
- Embedded graph database
- Cloud-hosted graph database

The projection can be **eventually consistent** with the event log.
A new event is appended immediately; the materialized view updates asynchronously.

---

## 5. Namespaces

Namespaces organize the graph into logical partitions within a single identity space.

### Purpose

Namespaces protect system internals from user modification.
They organize bootstrap so that system types, settings, and default views live in a reserved partition.
They enable imports of external vocabularies (schema.org, other users' type definitions) into isolated partitions.
They clarify upgrade boundaries: system namespace changes are app-managed, user namespaces are user-managed.

### Namespace resolution

A node's effective namespace is determined by its type, with an optional per-node override:

```
effective namespace = node.properties.namespace ?? node.type.namespace
```

The **type's namespace** is the default.
All nodes of a system-defined type inherit the system namespace.
A **per-node override** via an optional `namespace` property takes precedence when needed.

Namespace is not encoded in the node ID.
IDs remain clean UUIDv7 values.
Namespace is queryable and resolvable without special ID parsing.
The common case (type determines namespace) requires no extra data on the node.

### System namespace

The `system` namespace is reserved and application-controlled.
It contains:

- MetaType definitions (NodeType, EdgeType, PropertyType)
- System type definitions (TextBlock, CodeBlock, MarkdownNode, etc.)
- System edge type definitions (child_of, defines, references, etc.)
- Settings schemas (available options, default values, validation rules)
- Default view and renderer definitions
- System queries

Users cannot create or modify nodes in the system namespace.
System namespace mutations come only from bootstrap and migration events.

### User namespace

The default namespace for user-created types and content.
No restrictions on creation or modification.

### Imported namespaces

External vocabularies or type systems can be imported into their own namespaces.
Examples include schema.org vocabulary for linked-data property types, another user's published type definitions, or domain-specific vocabularies.

Import mechanics are TBD, but the namespace model supports them.

### External references

Not everything referenced by the graph needs to be a full node.
For external concepts (URLs, resources in other graphs), the system provides an **ExternalReference** system node type.

An ExternalReference node holds a URI property and optional cached metadata.
Normal edges can connect to ExternalReference nodes.
Automations can process external references, such as fetching HTTP metadata or resolving `canopy://` URIs.

To avoid mutating the external reference node itself, additional metadata is attached via **edge creation** to other nodes rather than modifying the ExternalReference node's properties.
This keeps the graph flexible while discouraging arbitrary property mutation on nodes you don't own.

---

## 6. Metatypes and bootstrap

### The bootstrap problem

Types are nodes, but you need types to create nodes.
This is resolved with a layered bootstrap.

### Layer 0: primordial types (application code)

Hardcoded definitions that exist only in application code.
They define the minimum structure needed to create the first nodes:

- What a node looks like
- What an edge looks like
- What a PropertyValue can be

These are never stored in the graph.
They are the firmware that makes the first boot possible.

### Layer 1: metatypes (self-describing nodes)

Three foundational types that live in the graph as nodes:

| Metatype         | Purpose                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| **NodeType**     | Defines what a node type is: required properties, optional properties, namespace |
| **EdgeType**     | Defines what an edge type is: properties, intended source/target types           |
| **PropertyType** | Defines a reusable property definition: name, value type, constraints            |

These are self-describing: the NodeType node has type NodeType.
They have well-known IDs in the system namespace.
They are created during bootstrap by emitting events.
Bootstrap is idempotent: if the nodes already exist, no events are emitted.

### Layer 2: system types (shipped with the app)

Types that the application provides out of the box.

Node types include TextBlock, CodeBlock, MarkdownNode, ExternalReference, ViewDefinition, Renderer, Query, SettingsSchema, and others.
Edge types include child_of, defines, references, renders, and others.
Property types include reusable definitions for common patterns.

These are validated against layer 1 metatypes.
They live in the system namespace.
They are created during bootstrap, after metatypes.

### Layer 3: user types

Types created by users at runtime.
Structurally identical to layer 2, just not shipped with the app.
Validated against the same layer 1 metatypes.
Live in the user namespace or a user-defined namespace.

### Bootstrap sequence

1. Load events from storage.
2. If no events exist (fresh vault), emit bootstrap events:
   a. Create layer 1 metatype nodes (NodeType, EdgeType, PropertyType).
   b. Create layer 2 system type nodes (TextBlock, CodeBlock, etc.).
   c. Create system edges, default views, default renderers, settings schemas.
3. Project all events into graph state.
4. Validate graph integrity.

Bootstrap events are tagged with migration metadata (version: initial).
Subsequent app upgrades emit additional migration events to add or modify system types.

### Validation

When a node is created, the system looks up its NodeType definition in the graph and validates:

- Required properties are present.
- Property values match the declared types.

Validation uses **structural typing**: extra properties beyond what the type defines are allowed.

For edge types, validation is **best-effort**.
The EdgeType definition declares intended source and target node types.
Violations produce warnings, not hard errors.
This keeps the graph flexible for emergent, cross-domain relationships.

---

## 7. Property vocabularies

> Status: **early concept, not fully designed**

PropertyType nodes (layer 1 metatype) define reusable property definitions:

- **name**: human-readable label (e.g., "Scheduled time")
- **value type**: the expected PropertyValue type (e.g., Instant for ISO8601 zoned datetime)
- **constraints**: optional validation rules (TBD: format, range, enum, etc.)

These can be composed into NodeType and EdgeType definitions.
This enables consistent property semantics across types: a "due date" means the same thing everywhere it appears.
External vocabularies (such as schema.org property definitions) can be mapped to PropertyType nodes.
Users can define domain-specific vocabularies.

Constraint validation is a future concern.
The current priority is establishing PropertyType as a first-class metatype that users and imports can populate.

---

## 8. Storage abstraction

### Principle

Events are portable.
Storage engines are pluggable.
The same event log can be materialized by different backends depending on deployment context.

### Event storage

The event log is append-only and immutable.
Storage adapters must support:

- **Append events** (with deduplication by EventId)
- **Load events** (full log or from a specific offset)
- **Snapshot** (compressed graph state at a point in time, for fast startup without full replay)

### Materialized view storage

The projected graph state can live in:

- In-memory (simplest, current implementation, suitable for small graphs)
- Embedded graph database (local, persistent, supports GQL queries natively)
- Cloud graph database (hosted, shared, multi-device)

The query layer (ISO GQL) targets the materialized view, not the event log.
The materialized view is eventually consistent with the event log.

### Deployment scenarios

| Scenario                   | Event storage             | Materialized view        | Sync mechanism                    |
| -------------------------- | ------------------------- | ------------------------ | --------------------------------- |
| Self-custodial / file sync | Event files on filesystem | In-memory or embedded DB | Google Drive, Dropbox, filesystem |
| Cloud-aware                | Managed event store       | Hosted graph DB          | Provider-managed                  |
| Local power-user           | Local embedded store      | Embedded graph DB        | LAN / direct device               |
| Mobile                     | Local lightweight store   | In-memory                | Sync on connectivity              |

In all cases, the event log is the portable artifact.
Rebuilding the materialized view from events is always possible.

---

## 9. Relationship to other design areas

This document covers the foundation.
Other areas build on it:

| Area                     | Relationship                                                                                | Status              |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------- |
| Content model            | TextBlock, CodeBlock, etc. are layer 2 system types; renderers interpret them               | Separate doc needed |
| View and renderer system | ViewDefinition and Renderer are system node types; rendering is a query + template pipeline | Separate doc needed |
| Query engine (ISO GQL)   | Queries target the materialized graph view; GQL is both internal and user-facing            | Separate doc needed |
| Sync and CRDT            | Manages the event log; merges events across devices                                         | Separate doc needed |
| Workflow system          | Workflow definitions are node types; execution produces events                              | Separate doc needed |
| Extension API            | Extensions define types in their own namespaces; WASM renderers are renderer nodes          | Separate doc needed |

---

## 10. Open questions

Tracked here for resolution in future design iterations:

1. Vault/universe terminology: what is the top-level container called?
2. Migration event structure: exact schema for version-tagged migration events.
3. Batch event semantics: EventBatch wrapper vs transaction ID vs other mechanism.
4. Object-typed properties: when and how to extend PropertyValue with nested structures.
5. Namespace import mechanics: how external vocabularies and type systems are imported.
6. Constraint validation on PropertyTypes: what validation rules are supported and when they run.
7. External reference URI schemes: `canopy://`, `https://`, and resolution behavior.
8. Yjs / event log integration for text content: hybrid model for character-level CRDT vs event-level granularity.
