# Canopy Open Design Questions

**Status:** Active
**Updated:** 2026-04-25
**Context:** Tracking architectural decisions and resolution progress

---

## 1. Resolved (v0.2 Implementation)

The following items from v0.1.1 refinement have been resolved and implemented.

### 1.1 Event Identity

- **Resolution:** `GraphEvent` now includes a mandatory `eventId: EventId` (UUIDv7).
- **Implementation:** Standardized across `@canopy/types` and projected in `@canopy/core`.

### 1.2 Settings Cascade

- **Resolution:** Implemented 4-level cascade: Node → Type → Namespace → Global.
- **Implementation:** `packages/core/src/settings.ts` provides `resolveSetting` helper.

### 1.3 Meta-circular Rendering

- **Resolution:** UI renderers are resolved via the graph settings and `Renderer` nodes.
- **Implementation:** `apps/web/src/components/renderers/BlockRenderer.tsx` uses `resolveSetting('default-renderer', ...)` to dynamicially select components from a registry.

### 1.4 Fractional Indexing

- **Resolution:** Using string-based lexicographical ordering for `child_of` edges.
- **Implementation:** Handled in `BlockRenderer` sorting logic and `fractional-indexing` utility (planned for expansion in Workflow Engine).

---

## 2. Priority 1: Core Content & Sync

### 2.1 Yjs ↔ Event Log Integration

**Problem:** Two CRDT systems coexist:

1. Event log (Yjs Y.Array of GraphEvents)
2. Text content (Yjs Y.Text for rich text editing)

**Current Path:**

- Text edits stay in `Y.Text` for performance.
- Graph updates (properties/edges) use `GraphEvent` log.
- **Open Question:** How to bind a `Y.Text` instance to a `TextBlock` node property cleanly?

---

### 2.2 Validation Timing

**Problem:** When does schema validation occur?

**Path:**

- **At projection:** Events are always accepted into the log, but projection (`applyEvent`) flags invalid nodes.
- **UI Guardrails:** UI prevents emitting obviously invalid events, but sync must handle invalid events from other devices.

---

### 2.3 Transaction Semantics

**Problem:** Some operations require multiple events atomically (e.g., Move).

**Resolution:**

- Events can share a `batchId`.
- Projection treats a batch as a single unit for undo/redo.
- **Open Question:** Should the `EventBus` buffer batches before emitting?

---

## 3. Priority 2: Pre-Prototype Requirements

### 3.1 Type Inheritance Semantics

- **Open:** How do properties merge? (Union vs. Override).
- **Open:** Can a subtype remove a required property? (Likely no).

### 3.2 Index Strategy

- **Open:** In-memory graph needs efficient reverse lookups (Edges by target).
- **Planned:** `Projection` should maintain these indexes as it consumes the event log.

---

## 4. Priority 3: Deferred (Post-Prototype)

### 4.1 Event Log Compaction

- Collapsing old events into snapshots.

### 4.2 Tombstone Garbage Collection

- Cleanup of deleted nodes/edges.

### 4.3 WASM Renderer Interface

- Finalizing the contract for non-system renderers.

---

_This document is updated as questions are resolved. Reference design doc version: v0.2_
