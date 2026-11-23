# GraphSession consistency, provenance, and ordering

> Status: **approved** (passed adversarial review)
> Bead: `canopy-anir.3.2`
> Depends on: [Canopy v0 architecture](../architecture/canopy-v0-architecture.md) ("Consistency, ordering, and migration model"), [Open and single-shape entities](2026-11-19-open-and-single-shape-entities.md)
> Baseline: `main` @ `00403e1`

## Context

The `canopy.v0` architecture and `packages/graph-access/typespec/main.tsp` specify dual event ordering (`hlcTimestamp` and `commitSeq`), actor provenance (`principalId`, `actorId`, `actorKind`, `deviceId`), three write consistency modes (`unconditional`, `entity-cas`, `graph-cas`), and read consistency gates (`minCommitSeq`, `atCommitSeq`, `atTimestamp`, `linearizable`).

Today, `@canopy/graph` lacks these primitives:

- `GraphEvent` (`packages/graph/src/events.ts`) and `GraphEventSchema` (`packages/graph/src/schemas.ts`) carry `timestamp: Instant` and `deviceId: DeviceId`, but no `hlcTimestamp`, `commitSeq`, `principalId`, `actorId`, or `actorKind`.
- `lwwWins` (`packages/graph/src/projection.ts`) orders concurrent writes by `(timestamp, deviceId)` rather than `hlcTimestamp`, and `TemporalMetadata` (`packages/graph/src/temporal.ts`) does not record `hlcTimestamp`.
- `MergeState` (`packages/graph/src/incremental-projection.ts`) tracks `propertyWriters` by `EventId` and does not track `headCommitSeq` or per-entity `entitySeqs`.
- `GraphSession` (`packages/graph/src/graph-session.ts`) exposes only `load()`, `commit(events)`, `graph()`, and `subscribe(handler)`. It has no CAS preconditions, no `concurrency-conflict` error kind in `CommitError`, and no async read consistency gates.
- `packages/graph-access/src/canopy-v0-server.ts` emulates `headCommitSeq`, `entitySeqs`, `checkWritePrecondition`, and `resolveConsistentGraph` in-memory on top of `GraphSession`.

## Goals and non-goals

Goals:

- Add branded `CommitSeq`, `HlcTimestamp`, `PrincipalId`, `ActorId`, and `ActorKind` types, factories, Zod schemas, and HLC clock/comparison helpers (`createHlcClock`, `compareHlcTimestamp`, `synthesizeLegacyHlc`) to `@canopy/graph`.
- Extend `GraphEvent` and `GraphEventSchema` with `hlcTimestamp`, `commitSeq`, `principalId`, `actorId`, and optional `actorKind` without `ApprovalState` or `properties.tenantId`.
- Extend `TemporalMetadata`, `lwwWins`, and `MergeState` to order by `hlcTimestamp` (synthesizing deterministic HLCs for legacy events so comparisons remain transitive) and track `headCommitSeq` and per-entity `entitySeqs` (`ReadonlyMap<NodeId | EdgeId, CommitSeq>`).
- Extend `GraphSession.commit` with provenance stamping (including per-commit `deviceId` override), monotonic `commitSeq` assignment per batch, and `unconditional` / `entity-cas` / `graph-cas` write preconditions.
- Add `GraphSession.readGraph(consistency?)`, `headCommitSeq()`, and `entitySeqs()` enforcing `minCommitSeq` read-your-writes/monotonic reads, `atCommitSeq` and `atTimestamp` point-in-time snapshots, and `linearizable` head reads.
- Wire `packages/graph-access/src/canopy-v0-server.ts` to delegate CAS preconditions, `commitSeq`, `entitySeqs`, and `readGraph` to `GraphSession`.
- Keep `mise run check` green across the workspace.

Non-goals:

- Rewriting persisted legacy event logs on disk; legacy events without `hlcTimestamp`/`commitSeq`/`principalId`/`actorId` remain readable.
- Multi-process or multi-session concurrent writers on a shared `EventLogStore`. This bead enforces a single-writer `GraphSession` per `graphId` invariant (no direct `eventLog.appendEvents` bypassing the owning session); storage-level atomic `commitSeq`/CAS enforcement in `EventLogStore` is deferred to multi-worker deployment work.
- Blue-Green `v1 -> v2` shadow projection migrations (separate Track C bead).

## Decisions

1. **Branded types and HLC format**:
   - `CommitSeq` is a branded non-negative safe integer (`number`, `Number.isSafeInteger(n) && n >= 0`; `0` = empty/initial graph, first commit = `1`).
   - `HlcTimestamp` is a branded `string` with canonical generated format `<13-digit-zero-padded-ms>:<6-digit-zero-padded-counter>:<actorId>` (e.g. `1700000000000:000000:alice`).
   - Internal HLC parsing uses regex `^(\d{1,16}):(\d{1,10}):(.+)$` (not `split(':')`) so `actorId` values containing colons (such as `actor:alice`) and existing test fixtures (such as `'1700000000000:0:alice'`) parse and compare structurally by `(physicalMs, counter, actorId)`.
   - `createHlcClock(actorId, options?)` enforces a configurable `maxDriftMs` (default `60_000` ms) in `receive(remote)` so a skewed client timestamp cannot permanently advance the session clock.
   - `PrincipalId` and `ActorId` are branded non-empty `string`s; `ActorKind` is `'user' | 'agent' | 'plugin' | 'workflow'`.

2. **Backward-compatible `GraphEvent` fields**:
   - `hlcTimestamp?: HlcTimestamp | undefined`, `commitSeq?: CommitSeq | undefined`, `principalId?: PrincipalId | undefined`, `actorId?: ActorId | undefined`, and `actorKind?: ActorKind | undefined` are optional on pre-commit `GraphEvent` types and `GraphEventSchema` (matching `batchId?: BatchId | undefined`) so existing event fixtures and legacy stored logs remain valid.
   - `GraphSession.commit` stamps `deviceId`, `batchId`, `principalId`, `actorId`, `hlcTimestamp`, and `commitSeq` (plus `actorKind` when set) on every committed event in `CommitSuccess.events`, overriding any caller-supplied placeholders.

3. **One `commitSeq` per atomic commit batch and legacy log mapping**:
   - Every non-empty `GraphSession.commit` increments `headCommitSeq` by `1` and stamps that `commitSeq` onto all events in the batch.
   - Empty commits (`events.length === 0`) still evaluate `precondition`, do not increment `headCommitSeq`, and return the current `headCommitSeq` and latest `hlcTimestamp` (ticking the clock if no commit has occurred yet).
   - During `load()` and `getGraphAt(..., { commitSeq })`, a shared pure helper assigns effective `commitSeq` values deterministically: events with `event.commitSeq !== undefined` use `event.commitSeq` (`headCommitSeq = Math.max(headCommitSeq, event.commitSeq)`); consecutive legacy events lacking `commitSeq` that share a non-undefined `batchId` share one incremented `commitSeq`, and legacy events with `batchId === undefined` increment `headCommitSeq` by `1` each (including `WorkflowStarted` / `WorkflowCompleted`).

4. **Per-entity `entitySeqs` tracking**:
   - `MergeState` tracks `headCommitSeq: CommitSeq` and `entitySeqs: ReadonlyMap<NodeId | EdgeId, CommitSeq>`.
   - Applied `NodeCreated`, `NodePropertiesUpdated`, `EdgeCreated`, `EdgePropertiesUpdated`, and `EdgeDeleted` events set `entitySeqs.set(event.id, effectiveCommitSeq)`.
   - Applied `NodeDeleted` sets `entitySeqs.set(event.id, effectiveCommitSeq)` and also sets `entitySeqs.set(edgeId, effectiveCommitSeq)` for every cascade-deleted incident edge.
   - Idempotent no-op events (for example, `NodeDeleted` on an already-tombstoned or missing node) do not update `entitySeqs`.
   - `WorkflowStarted` / `WorkflowCompleted` advance `headCommitSeq` without modifying `entitySeqs`.
   - Unreferenced entity IDs default to `ZERO_COMMIT_SEQ` (`0`).

5. **Write consistency modes on `GraphSession.commit`**:
   - `CommitOptions` accepts optional `provenance` (`principalId?`, `actorId?`, `actorKind?`, `deviceId?`, `hlcTimestamp?`) and `precondition` (`WritePrecondition`: `unconditional`, `entity-cas`, or `graph-cas`). Default mode is `'unconditional'`.
   - `entity-cas` checks every `(entityId, expectedSeq)` entry against `mergeState.entitySeqs.get(entityId) ?? ZERO_COMMIT_SEQ`. Any mismatch rejects with `CommitError` `kind: 'concurrency-conflict'` before batch validation or storage append. Disjoint-entity CAS writes never conflict with each other while remaining serialized on the graph's FIFO commit queue.
   - `graph-cas` checks `expectedGraphSeq === headCommitSeq` and rejects with `CommitError` `kind: 'concurrency-conflict'` on mismatch.
   - `DraftSession.commit` maps `CommitError` `kind: 'concurrency-conflict'` to `DraftCommitError` `kind: 'concurrent-modification'`.

6. **Read consistency modes on `GraphSession.readGraph`**:
   - `ReadConsistency` supports `minCommitSeq`, `atCommitSeq`, `atTimestamp`, `linearizable`, and `timeoutMs` (default `5000` ms).
   - `minCommitSeq`: returns immediately when `headCommitSeq >= minCommitSeq`; otherwise registers a bounded waiter (max `1000` pending waiters, excess returns `kind: 'resource-exhausted'`) settled with `clearTimeout` whenever `commit()` or `load()` advances `headCommitSeq >= minCommitSeq`. `timeoutMs: 0` returns `kind: 'consistency-timeout'` immediately if unmet (used by `canopy-v0-server.ts` for synchronous HTTP `CONCURRENCY_CONFLICT` responses).
   - `atCommitSeq` / `atTimestamp`: mutually exclusive (passing both returns `kind: 'validation'`). Both reconstruct an immutable snapshot from `eventLog` via `getGraphAt` without blocking live writers. `atCommitSeq === 0` returns the initial `'graph'` state; `atCommitSeq > headCommitSeq` (after checking loaded state) returns `kind: 'not-found'`. `atTimestamp` returns `commitSeq` equal to the max effective `commitSeq` of included events (`0` if none).
   - `linearizable: true`: fences behind the session's `enqueue` queue (running `load()` once if the session has not loaded yet) so all in-flight writes are visible before reading.

7. **Transitive LWW projection with HLC**:
   - `TemporalMetadata` (`packages/graph/src/temporal.ts`) adds `readonly hlcTimestamp?: HlcTimestamp | undefined`.
   - `lwwWins(incoming: LwwStamp, current: LwwStamp)` compares effective HLC (`stamp.hlcTimestamp ?? synthesizeLegacyHlc(stamp.timestamp, stamp.deviceId)`) via `compareHlcTimestamp`, using `deviceId` (and `eventId` for `propertyWriters`) as tiebreaker. This guarantees a single transitive total order across HLC and legacy events.
   - `incremental-projection.ts` stores `PropertyWriterStamp` (`eventId`, `timestamp`, `deviceId`, `hlcTimestamp?`) in `propertyWriters` and resolves per-property LWW with `lwwWins`, matching `projection.ts`.

## Detailed design

All optional fields include `| undefined` for `"exactOptionalPropertyTypes": true`, and all interfaces/records use `readonly` / `Readonly<...>` for `functional/prefer-immutable-types`. Helpers inside `graph-session.ts` avoid `void` return types (`functional/no-return-void`) and use `{ current: ... }` cells (`functional/immutable-data`).

### 1. Identifiers, HLC, and schemas (`@canopy/graph`)

- `packages/graph/src/identifiers.ts` & `factories.ts`:
  - Add `CommitSeq`, `PrincipalId`, `ActorId` brands, `asCommitSeq`, `asPrincipalId`, `asActorId`, and `ZERO_COMMIT_SEQ = asCommitSeq(0)`.
- `packages/graph/src/hlc.ts` (new module):
  - `HlcTimestamp` brand, `ActorKind = 'user' | 'agent' | 'plugin' | 'workflow'`.
  - `synthesizeLegacyHlc(timestamp: Instant, deviceId: DeviceId): HlcTimestamp`.
  - `compareHlcTimestamp(a: HlcTimestamp, b: HlcTimestamp): -1 | 0 | 1`.
  - `createHlcClock(actorId: ActorId, options?: Readonly<{ nowMs?: (() => number) | undefined; maxDriftMs?: number | undefined }>): HlcClock` with `tick(): HlcTimestamp`, `receive(remote: HlcTimestamp): Result<HlcTimestamp, Error>`, and `last(): HlcTimestamp | undefined`.
- `packages/graph/src/schemas.ts`:
  - Add `CommitSeqSchema`, `HlcTimestampSchema`, `PrincipalIdSchema`, `ActorIdSchema`, `ActorKindSchema`.
  - Extend all 8 event schemas in `GraphEventSchema` with optional `hlcTimestamp`, `commitSeq`, `principalId`, `actorId`, and `actorKind`.

### 2. Projection, `MergeState`, and `history.ts`

- `packages/graph/src/temporal.ts`: add `readonly hlcTimestamp?: HlcTimestamp | undefined` to `TemporalMetadata`.
- `packages/graph/src/projection.ts`: update `lwwWins(incoming: LwwStamp, current: LwwStamp): boolean` and `applyEvent` to store and compare `hlcTimestamp`.
- `packages/graph/src/incremental-projection.ts`:
  - Add `readonly headCommitSeq: CommitSeq` and `readonly entitySeqs: ReadonlyMap<NodeId | EdgeId, CommitSeq>` to `MergeState`.
  - Update `propertyWriters` to `ReadonlyMap<string, PropertyWriterStamp>` using `lwwWins`.
  - Export `resolveEventCommitSeqs` for deterministic legacy/modern `commitSeq` resolution.
- `packages/graph/src/history.ts`:
  - Extend `TimeTravelTarget` with `| Readonly<{ commitSeq: CommitSeq }>`.
  - Project `commitSeq` snapshots through `mergeEvents` with `resolveEventCommitSeqs` and graph name `'graph'`.

### 3. `GraphSession` (`packages/graph/src/graph-session.ts`, `batch-validation.ts`)

```ts
export interface CommitProvenance {
  readonly principalId?: PrincipalId | undefined;
  readonly actorId?: ActorId | undefined;
  readonly actorKind?: ActorKind | undefined;
  readonly deviceId?: DeviceId | undefined;
  readonly hlcTimestamp?: HlcTimestamp | undefined;
}

export type WritePrecondition =
  | Readonly<{ mode: 'unconditional' }>
  | Readonly<{
      mode: 'entity-cas';
      expectedEntitySeq: ReadonlyMap<NodeId | EdgeId, CommitSeq>;
    }>
  | Readonly<{ mode: 'graph-cas'; expectedGraphSeq: CommitSeq }>;

export interface CommitOptions {
  readonly provenance?: CommitProvenance | undefined;
  readonly precondition?: WritePrecondition | undefined;
}

export interface GraphSessionOptions {
  readonly principalId?: PrincipalId | undefined;
  readonly actorId?: ActorId | undefined;
  readonly actorKind?: ActorKind | undefined;
  readonly nowMs?: (() => number) | undefined;
  readonly maxDriftMs?: number | undefined;
}

export interface ReadConsistency {
  readonly minCommitSeq?: CommitSeq | undefined;
  readonly atCommitSeq?: CommitSeq | undefined;
  readonly atTimestamp?: Instant | undefined;
  readonly linearizable?: boolean | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface ReadGraphResult {
  readonly graph: Graph;
  readonly commitSeq: CommitSeq;
}

export type ReadConsistencyError =
  | Readonly<{ kind: 'consistency-timeout'; message: string; actualSeq: CommitSeq; requiredSeq: CommitSeq }>
  | Readonly<{ kind: 'not-found'; message: string; requestedSeq: CommitSeq }>
  | Readonly<{ kind: 'validation'; message: string }>
  | Readonly<{ kind: 'resource-exhausted'; message: string }>
  | Readonly<{ kind: 'storage'; message: string; cause: Error }>;
```

- `CommitError` adds `| Readonly<{ kind: 'concurrency-conflict'; message: string; entityId?: NodeId | EdgeId | undefined; expectedSeq?: CommitSeq | undefined; actualSeq?: CommitSeq | undefined }>`.
- `CommitSuccess` adds `readonly commitSeq: CommitSeq` and `readonly hlcTimestamp: HlcTimestamp`.
- `GraphSession` adds `headCommitSeq(): CommitSeq`, `entitySeqs(): ReadonlyMap<NodeId | EdgeId, CommitSeq>`, and `readGraph(consistency?: ReadConsistency): Promise<Result<ReadGraphResult, ReadConsistencyError>>`.

### 4. `packages/graph-access` alignment

- Update `packages/graph-access/src/canopy-v0-server.ts` to delegate CAS precondition checks, `commitSeq`, `entitySeqs`, and `readGraph` (passing `timeoutMs: 0` for `minCommitSeq`) to `GraphSession`, removing `headCommitSeq` and `entitySeqs` from `ManagedV0GraphState`.
- Map `CommitError` `'concurrency-conflict'` -> `'CONCURRENCY_CONFLICT'` and `ReadConsistencyError` `'consistency-timeout'` -> `'CONCURRENCY_CONFLICT'`, `'not-found'` -> `'NOT_FOUND'`, `'validation'` -> `'VALIDATION_ERROR'`, `'resource-exhausted'` -> `'RESOURCE_EXHAUSTED'`, `'storage'` -> `'INTERNAL_ERROR'`.

## Verification plan

- Unit and integration tests in `packages/graph/src/`:
  - HLC clock monotonicity under backward wall-clock jumps, `receive` drift rejection, colon-containing `actorId`s, and structural comparison.
  - `GraphSession.commit` provenance stamping, `commitSeq` monotonicity, `entity-cas` conflict on same entity (including cascade-deleted edges) vs non-conflicting disjoint-entity writes, and `graph-cas` conflict.
  - `GraphSession.readGraph` for `minCommitSeq` (immediate when caught up, awaits concurrent commit/load, times out when unmet), `atCommitSeq` (`0`, legacy, and stamped logs), `atTimestamp`, and `linearizable`.
  - `lwwWins` and `mergeEvents` convergence across HLC and legacy events.
- `packages/graph-access` TypeSpec contract tests remain green.
- `packages/graph/src/README.md` and `packages/graph-access/src/README.md` updated to match new interfaces and invariants.
- Full `mise run check` (build, lint, typecheck, test) passes.
