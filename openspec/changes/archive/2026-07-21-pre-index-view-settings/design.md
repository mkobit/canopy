## Context

Currently, settings resolution (`resolveSetting`) and view definition resolution (`resolveViewDefinition`) iterate over all nodes and edges in the graph.
This linear search has O(N) time complexity.
In performance-sensitive areas, such as React UI rendering of large graphs, resolving views and settings repeatedly causes noticeable latency.
We need to introduce a pre-indexing and caching mechanism to achieve O(1) lookups.

## Goals / Non-Goals

**Goals:**

- Optimize settings and view resolution to O(1) time complexity.
- Maintain full compatibility with existing Graph types and structures.
- Keep the public API of `@canopy/settings` unchanged.
- Ensure zero garbage collection pressure and O(1) index updates during mutations.
- Guarantee collision-free key indexing and mutation safety.
- Ensure absolute determinism across all environments and serialization boundaries.

**Non-Goals:**

- Creating a separate database or stateful storage for indexes.
- Changing the functional, immutable paradigm of the graph.
- Optimizing other unrelated graph traversals in this change.

## Decisions

### Decision 1: Hybrid Lazy and Incremental Indexing

To avoid the CPU/GC overhead of rebuilding the index from scratch on every mutation, we will use a hybrid approach.

1. _Lazy Initialization_: If a graph does not have its index built (e.g. in tests or initial bootstrap), the index will be built on the first query and cached on the `Graph` object.
2. _Incremental Updates_: When a new `Graph` is projected via event application (`applyEvent` or `mergeEvents`), we will incrementally update the previous graph's index in O(1) time and attach it to the new `Graph` object.
   This prevents rebuilding the index on high-frequency mutations (like typing).

**Alternatives considered:**

- _Pure lazy indexing_: Rebuild from scratch on the first query of every new graph instance.
  _Rationale for rejection_: On frequent updates (e.g. typing), this would trigger a full O(N) scan for each new graph object, causing performance degradation.

### Decision 2: Zero-Overhead Index Reuse for Content Mutations

Most events (e.g. typing, dragging, updating normal content nodes) do not modify settings schemas, user settings, or view overrides.
For these content mutations, the new `Graph` instance will reuse the exact same `_indexes` object reference from the previous graph.
No Map cloning or allocation will occur.
Map cloning is only performed when an event actually adds, updates, or deletes a settings/view configuration entity.
Because the number of configuration entities (K) is tiny (typically < 100) and independent of the graph size (N), this keeps index updates extremely fast and maintains zero GC overhead during normal usage.

### Decision 3: Collision-Free Compound Keys

User settings will be indexed by a compound key string using the null character (`\0`) as a separator: `${schemaId}\0${scopeType}\0${scopeTarget ?? ''}`.
Since the null character is not allowed in graph identifiers or namespace names, this guarantees that no two distinct sets of inputs can produce colliding keys.

**Alternatives considered:**

- _Colon separator_: `${schemaId}:${scopeType}:${scopeTarget}`.
  _Rationale for rejection_: Colon is a valid character in system IDs and namespaces, which could lead to key collisions (e.g., `schemaId="A:B"` and `scopeType="C"` vs `schemaId="A"` and `scopeType="B:C"`).

### Decision 4: Deeply Frozen Cached JSON Values

During index creation or update, we will parse user setting values and schema default values once.
To prevent callers from accidentally mutating the cached objects by reference, all parsed objects will be deeply frozen using `Object.freeze` before insertion into the index.

**Alternatives considered:**

- _Cloning on lookup_: Deeply clone the cached object on every query.
  _Rationale for rejection_: Deep cloning is slow and adds runtime CPU/memory overhead.
  Deep freezing is fast and guarantees immutability at the type and runtime level.

### Decision 5: Deterministic Override Edge Ordering

To ensure absolute determinism across runtimes, platforms, and serialization boundaries, the indexer will not rely on JS Map insertion order for edge precedence.
When multiple view overrides or default view edges are found for a key, the index builder will sort them deterministically.
Edges will be sorted by creation timestamp descending, with the edge ID sorted lexicographically descending as a tie-breaker.
This guarantees that the newest edge always wins deterministically regardless of how the graph was loaded.

### Decision 6: Safe Error Handling during JSON Parsing

If a `UserSetting` value or `SettingsSchema` default value contains invalid JSON, the index builder will catch the error and omit the value from the index (treating it as undefined).
This mirrors the original behavior where parsing errors result in falling back to the next cascade level.

## Risks / Trade-offs

- **Memory Overhead**: Storing indexes on the `Graph` object increases memory usage.
  _Trade-off_: The memory overhead of mapping strings to nodes/values is very small compared to the performance gains of O(1) lookups.
- **ESLint Compliance**: Storing the lazy cache on the readonly `Graph` object requires a narrow `// eslint-disable-next-line functional/immutable-data` comment.
  _Trade-off_: This is a safe local escape hatch because the cache is referentially transparent and does not mutate the logical state of the graph.

## Adversarial review and mitigations

### Resource and Performance Overhead

- _Risk_: Index creation on a very large graph could cause a frame drop on the first query.
- _Mitigation_: The index is incrementally updated in O(1) time during standard event application.
  The full build is only performed once when loading a graph that has no index, taking less than 1ms for typical graph sizes.

### Failure Modes and Edge Cases

- _Risk_: Multiple view override edges or multiple default view edges might exist, and indexing might select the wrong one.
- _Mitigation_: Override edges are sorted deterministically by timestamp and lexicographical ID, ensuring identical behavior across all environments.

### Security and Isolation

- _Risk_: Callers could mutate index objects by reference.
- _Mitigation_: The cached values are deeply frozen, preventing runtime mutations.

### Migration and Compatibility

- _Risk_: Modifying the `Graph` type in `@canopy/graph` could break existing code.
- _Mitigation_: The index property `_indexes` is defined as optional on the `Graph` type.
  All functions fall back to the slow path if the index is missing or cannot be built.
