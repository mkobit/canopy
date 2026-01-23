# Canopy Open Design Questions

**Status:** Active
**Created:** 2025-01-22
**Context:** Gaps identified during v0.1.1 refinement pass

---

## Priority 1: Blocks Implementation

These must be resolved before core implementation proceeds.

### 1.1 Event Identity and Deduplication

**Problem:** Events need unique IDs for:

- Deduplication during sync (same event received twice)
- References from other events (e.g., "undo event X")
- Audit trail queries ("show me event E")

**Questions:**

- Is EventId a UUIDv7 like NodeId/EdgeId?
- Who generates the ID? (Event creator vs storage layer)
- How do we detect duplicate events during Yjs merge?

**Proposed shape:**

```typescript
interface GraphEvent {
  eventId: EventId; // NEW: unique identifier
  timestamp: Instant;
  // ... rest of event
}

type EventId = Brand<string, 'EventId'>; // UUIDv7
```

---

### 1.2 Yjs ↔ Event Log Integration

**Problem:** Two CRDT systems coexist:

1. Event log (Yjs Y.Array of GraphEvents)
2. Text content (Yjs Y.Text for rich text editing)

**Questions:**

- Are text edits captured as GraphEvents, or are they a parallel sync channel?
- If parallel: how do we correlate a text document with its parent node?
- If unified: what does a "character inserted" event look like? (Too granular?)
- How does undo work across both systems?

**Options:**

| Approach              | Pros                                               | Cons                                         |
| --------------------- | -------------------------------------------------- | -------------------------------------------- |
| **Separate channels** | Natural fit for Yjs; text ops stay in Y.Text       | Two sync mechanisms; undo complexity         |
| **Unified events**    | Single source of truth; clean audit trail          | Massive event volume for text; perf concerns |
| **Hybrid**            | Text edits in Y.Text; periodic snapshots as events | Complexity; snapshot timing decisions        |

**Recommendation:** Needs dedicated design session.

---

### 1.3 Validation Timing

**Problem:** When does schema validation occur?

**Options:**

1. **At event creation** — Fail fast, but requires graph access during event construction
2. **At projection** — Events always accepted; invalid state flagged in graph
3. **Both** — Validate at creation; re-validate at projection (defense in depth)

**Questions:**

- What happens if Device A creates a valid event, then Device B deletes the NodeType before sync?
- Should validation errors block projection or just annotate nodes?
- How do we handle "eventual validity" during sync?

**Related:** How do warnings vs errors differ? Current spec says "warnings, not blockers" but doesn't define behavior.

---

### 1.4 Transaction Semantics

**Problem:** Some operations require multiple events atomically.

**Example:** Move block from Parent A to Parent B

1. Delete edge (Block)→[child_of]→(Parent A)
2. Create edge (Block)→[child_of]→(Parent B)

If only event 1 succeeds, block is orphaned.

**Questions:**

- Do we need a Transaction wrapper for event batches?
- What's the failure mode if event 2 fails validation?
- How does this interact with Yjs sync? (Yjs doesn't have transactions)

**Proposed shape:**

```typescript
interface EventBatch {
  batchId: EventId;
  events: readonly GraphEvent[];
  atomic: boolean; // All or nothing?
}
```

---

### 1.5 Immutable Data Structure Choice

**Problem:** Need immutable structures for functional core. Options:

| Library                 | Pros                                        | Cons                                               |
| ----------------------- | ------------------------------------------- | -------------------------------------------------- |
| **Immutable.js**        | Battle-tested; rich API; structural sharing | Large bundle; non-native types; interop friction   |
| **Immer**               | Native JS objects; easy migration; small    | Proxy overhead; less explicit immutability         |
| **Native + discipline** | Zero deps; native interop                   | Easy to accidentally mutate; no structural sharing |

**Questions:**

- What's the performance profile for our expected graph sizes?
- Do we need structural sharing? (Matters for large graphs + frequent updates)
- How does choice affect Yjs integration?

**Recommendation:** Benchmark with representative graph size (10k nodes, 50k edges) before deciding.

---

### 1.6 Fractional Indexing

**Problem:** Block ordering uses fractional indexes. Need to pick a library and handle edge cases.

**Options:**

- `fractional-indexing` npm package
- Custom implementation
- Yjs Y.Array (implicit ordering)

**Questions:**

- What happens when positions exhaust? (e.g., can't insert between "a" and "a0")
- How do we rebalance? (Rewrite all positions in parent)
- Is rebalancing a single event or per-block events?

---

## Priority 2: Pre-Beta Requirements

### 2.1 Type Inheritance Semantics

**Problem:** NodeType can `extend` another NodeType, but rules undefined.

**Questions:**

- How do properties merge? Override? Union?
- Can a subtype remove a required property from parent?
- How does validation work with inheritance chains?
- Can EdgeType constraints reference parent types? ("accepts Concept or any subtype")

---

### 2.2 Edge Constraint Validation

**Problem:** EdgeType defines `sourceTypes` and `targetTypes`, but enforcement unclear.

**Questions:**

- When is this validated? (Edge creation? Node type change?)
- What happens if a node's type changes to violate existing edges?
- Are constraints checked against concrete types or inheritance hierarchy?

---

### 2.3 Index Strategy

**Problem:** Query performance depends on indexes. In-memory graph needs:

**Likely indexes:**

- Nodes by type: `Map<NodeTypeId, Set<NodeId>>`
- Edges by source: `Map<NodeId, Set<EdgeId>>`
- Edges by target: `Map<NodeId, Set<EdgeId>>`
- Edges by type: `Map<EdgeTypeId, Set<EdgeId>>`

**Questions:**

- Are indexes part of Graph state or computed separately?
- How do indexes update during projection? (Incremental vs rebuild)
- Do we need property indexes? (e.g., all nodes where status='active')

---

### 2.4 Error Taxonomy

**Problem:** `Result<T, E>` used throughout, but error types undefined.

**Needed:**

```typescript
type GraphError =
  | ValidationError
  | NotFoundError
  | ConstraintViolationError
  | ConcurrencyError
  | StorageError
  | QueryError
  | RenderError;

// Each needs: code, message, context, recoverable?
```

---

### 2.5 Settings Cascade Formalization

**Problem:** Settings resolve Node → User → System, but mechanism unclear.

**Questions:**

- Is this a query or special-cased lookup?
- How do we express "inherit from parent except X"?
- Are settings changes events? (Affects sync)

---

## Priority 3: Deferred (Post-Beta)

### 3.1 Event Log Compaction

Can we collapse old events into snapshots and discard originals?

- Implications for audit trail
- Implications for time-travel queries
- Mechanism for "archive before date X"

### 3.2 Tombstone Garbage Collection

Deleted nodes accumulate as tombstones. Eventually need cleanup.

- Safe deletion criteria (no references? age threshold?)
- Implications for undo (can't undo after GC)
- Coordination across devices

### 3.3 Hot Reload

Can ViewDefinitions/Renderers update without app restart?

- Cache invalidation
- In-flight render handling
- WASM module replacement

### 3.4 Undo/Redo Grouping

Event sourcing enables undo, but UI grouping undefined.

- What constitutes an "undo unit"? Single event? User action?
- How do text edits (Y.Text) integrate with graph undo?
- Undo across sync (undo my changes, not collaborator's)

### 3.5 Migration Testing

How to test schema migrations before applying?

- Dry-run mode
- Rollback strategy
- Migration on subset of events

---

## Architectural Questions for Discussion

### Sync Architecture

- Should text content have its own Yjs document per node, or one global document?
- How do we handle sync conflicts that can't be auto-resolved?
- What's the reconnection strategy after extended offline?

### Performance Boundaries

- Expected graph size limits? (100k nodes? 1M?)
- Event log size before degradation?
- Snapshot frequency tradeoffs?

### Content Model Edge Cases

- Transclusion cycles (A embeds B embeds A)
- Code execution: results as nodes or properties?
- Binary content (images): inline base64 or external references?

---

## Mutation Audit

The v0.1.1 refinement doc contains mutation anti-patterns that need fixing:

| Location         | Issue                               | Fix               |
| ---------------- | ----------------------------------- | ----------------- |
| Startup sequence | `events.push(...)`                  | Return new array  |
| Bootstrap        | `Map.set()` assumed mutable         | Use immutable Map |
| General          | Spread operator used inconsistently | Establish pattern |

**Rule:** All functions in core must be pure. Side effects only at:

- Storage adapter boundary
- Yjs sync boundary
- UI event handlers

---

## Next Steps

1. **Resolve P1 items** before implementation continues
2. **Pick immutable data structure** — benchmark first
3. **Design Yjs integration** — dedicated session recommended
4. **Define error taxonomy** — needed for API contracts

---

_This document should be updated as questions are resolved. Reference design doc version: v0.1.1_
