## 1. Core Types and Index Construction in @canopy/graph

- [x] 1.1 Define the `GraphIndexes` type and add the optional `_indexes` field to the `Graph` type in `packages/graph/src/graph.ts`
- [x] 1.2 Implement the `buildGraphIndexes` function to construct settings and view indexes from scratch with null-byte compound keys and deep-freezing
- [x] 1.3 Implement the `incrementalUpdateIndexes` function to incrementally update the indexes in O(1) time
- [x] 1.4 Update graph event application in `packages/graph/src/projection.ts` and `packages/graph/src/incremental-projection.ts` to propagate index references or apply incremental updates

## 2. Setting and View Resolution Updates in @canopy/settings

- [x] 2.1 Update settings schema and user settings lookup in `packages/settings/src/cascade.ts` to check indexes first
- [x] 2.2 Update view definition resolution in `packages/settings/src/view-resolution.ts` to use the pre-indexed structures and deterministic override edge sorting

## 3. Verification and Quality Gates

- [x] 3.1 Run tests, linter, typecheck, and build processes to verify all checks pass
- [x] 3.2 Add specific unit tests to verify correctness of index lookups and deterministic edge sorting
