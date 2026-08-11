## 1. Revision type and graph field (`@canopy/graph`)

- [x] 1.1 Add a `revisionBrand` symbol and `Revision` branded string type to `packages/graph/src/identifiers.ts`, mirroring `EventId`.
- [x] 1.2 Add `readonly revision: Revision` to the `Graph` type in `packages/graph/src/graph.ts`.
- [x] 1.3 Add a helper in `packages/graph/src/factories.ts` (or a small `revision.ts`): `asRevision(id: string): Revision`, `zeroRevision(): Revision` (all-zero UUID sentinel that sorts below any real `EventId`), and `maxRevision(current: Revision, eventId: EventId): Revision` returning the lexicographically greater value.
- [x] 1.4 Seed `revision: zeroRevision()` in `packages/graph/src/create-graph.ts` alongside the existing `metadata` seed.

## 2. Fold revision in projection (`@canopy/graph`)

- [x] 2.1 In `packages/graph/src/projection.ts`, update every `applyEvent` case that currently max-folds `metadata.modified` (NodeCreated, NodePropertiesUpdated, NodeDeleted, EdgeCreated, EdgePropertiesUpdated, EdgeDeleted) to also set `revision: maxRevision(graph.revision, event.eventId)`.
- [x] 2.2 In `packages/graph/src/incremental-projection.ts`, update `touchGraphMetadata` (or its call sites) to fold `revision` with the same `maxRevision` update, applied only where an event is actually applied (matching the existing `modified` behavior), so it converges under any delivery order.
- [x] 2.3 Confirm no other module constructs a `Graph` literal that would omit `revision` (grep for `metadata: {` graph constructions); update any found site to seed/carry `revision`.

## 3. Repoint DraftSession at the new token (`@canopy/graph`)

- [x] 3.1 In `packages/graph/src/draft-session.ts`, change `getParentRevision()` to return `parentGraph.revision` (as a string) instead of `parentGraph.metadata.modified`.
- [x] 3.2 In `DraftSession.commit`, compare `expectedParentRevision` against `parentGraph.revision`; keep the `concurrent-modification` error path unchanged.
- [x] 3.3 Remove the artificial-delay stopgap in `packages/api-adapter/tests/draft-flow.test.ts` test 8.2 (added in PR #434) and confirm the test still deterministically observes `concurrent-modification` via the new token.

## 4. Tests (`@canopy/graph`)

- [x] 4.1 Unit test per op event type: committing an event advances `graph.revision` to the event's `EventId`, and a losing (lower-`EventId`, shadowed) write does not lower it.
- [x] 4.2 Extend the existing permutation-invariance property test (`graph-session`/incremental-projection) to assert `revision` is identical across random permutations of the same event set, alongside the existing graph-state assertion.
- [x] 4.3 Same-millisecond regression test: two commits whose events share a wall-clock millisecond produce distinct `revision` values, and a draft capturing the first revision is rejected on commit after the second.
- [x] 4.4 Empty/bootstrap graph: `getParentRevision()` returns the zero sentinel and a first commit advances it; a draft created and committed against a fresh graph with no intervening change succeeds.

## 5. Opaque-wire confirmation (`@canopy/api-adapter`)

- [x] 5.1 Confirm no `@canopy/api-adapter` or `apps/daemon` code change is required: `DraftCreateResult.parentRevision` / `DraftCommitParams.expectedParentRevision` stay `z.string()`; the IPC draft handlers forward the token verbatim without inspecting its format.
- [x] 5.2 Add/adjust an adapter-level test asserting the draft round trip (`draft.create → apply → out-of-band mutation → commit`) surfaces `concurrent-modification` without relying on any timing delay.

## 6. Quality gates

- [x] 6.1 `bun run build` then `bun run lint`, `bun run typecheck`, `bun test` all green (build before lint per repo CI ordering).
- [x] 6.2 `bunx openspec validate draft-revision-token-hardening --strict` passes.
- [x] 6.3 Confirm `apps/web` display and query sorting on `metadata.modified` are unchanged (the timestamp field retains its meaning; `revision` is not added to query-sortable fields).
