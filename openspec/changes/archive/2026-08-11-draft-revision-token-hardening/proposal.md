## Why

`DraftSession.commit(expectedParentRevision)` does optimistic-concurrency control by comparing the client-captured `expectedParentRevision` against `parentSession.graph().metadata.modified` (`packages/graph/src/draft-session.ts`).
`metadata.modified` is a millisecond-resolution wall-clock `Instant` (`createInstant()` → `Temporal.Now.instant()`), and projection tracks it as a running max over event timestamps (`packages/graph/src/projection.ts`, `incremental-projection.ts`).
Two commits that land within the same millisecond produce an identical `modified` string, so a stale draft's `expectedParentRevision` can equal the new current revision even though the graph changed in between — the equality check that should catch the stale commit silently passes.
This was flagged as an accepted-for-v1 limitation ("Non-unique revision token") in `openspec/changes/archive/2026-08-10-agent-daemon-draft-preview/design.md`, with a hardening bead (`canopy-zm3`) filed to replace the timestamp token with a strictly monotonic, collision-proof one.
It is not theoretical: real macOS CI caught exactly this collision in `packages/api-adapter/tests/draft-flow.test.ts`'s concurrent-modification test (8.2) — a fast `draft.create → apply → out-of-band mutation` round trip landed inside one millisecond on that runner, and the concurrent-modification check failed to fire.
That test was made deterministic with an artificial delay as a stopgap (PR #434); this change fixes the underlying token design so the delay is no longer load-bearing.

## What Changes

- Add a dedicated, collision-proof revision token to the projected `Graph` in `@canopy/graph`, derived as the running maximum applied `EventId` (globally unique UUIDv7, already the canonical projection sort key) rather than the wall-clock `metadata.modified` timestamp.
- Repoint `DraftSession.getParentRevision()` and `DraftSession.commit()`'s equality check at the new token instead of `metadata.modified`.
- Preserve `metadata.modified` unchanged as the human-facing "last modified" timestamp (it is rendered and sorted on — `apps/web/src/test/generators/query-generators.ts` sorts on `metadata.modified`), so this is additive, not a repurposing.
- Keep the token an **opaque string** end to end: the JSON-RPC wire contract (`DraftCreateResult.parentRevision`, `DraftCommitParams.expectedParentRevision`, both `z.string()`) is unchanged, requiring zero `@canopy/api-adapter` or `apps/daemon` code changes.

## Capabilities

### New Capabilities

<!-- None. This tightens an existing requirement; no new capability surface. -->

### Modified Capabilities

- `draft-session`: the "Commit staged draft events with revision check" requirement is tightened so the revision token is guaranteed unique per distinct graph state — two commits that occur within the same wall-clock millisecond MUST still produce distinct revisions, and a stale commit MUST be rejected.

## Impact

- `@canopy/graph` (only code change): a `revision` field on `Graph`, maintained by a max-over-`EventId` fold in the same projection sites that currently update `metadata.modified` (`projection.ts`, `incremental-projection.ts`, `create-graph.ts`); `draft-session.ts` reads it instead of `metadata.modified`.
- `@canopy/api-adapter`: no code change expected. `parentRevision`/`expectedParentRevision` stay opaque `z.string()` values; the daemon and IPC draft handlers forward them verbatim.
- `apps/daemon`, `apps/cli`, `apps/web`: no change. `metadata.modified` retains its timestamp semantics for display and query sorting.
- No storage or schema migration: the token is derived from the existing event log at projection time and is not persisted independently; an existing vault yields a correct token on the next `load()`.
