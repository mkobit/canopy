# Design: harden the DraftSession revision token

## Context

`DraftSession` (`packages/graph/src/draft-session.ts`) implements optimistic-concurrency control for two-phase draft commits.
A client calls `getParentRevision()` to capture a token, stages events with `applyEvents`, and later calls `commit(expectedParentRevision)`.
`commit` compares `expectedParentRevision` against `parentSession.graph().metadata.modified` and, only if they are equal, delegates to `parentSession.commit(stagedEvents)`; otherwise it returns `{ type: 'concurrent-modification' }`.

`metadata.modified` is an `Instant` — an ISO-8601 string produced by `createInstant()` wrapping `temporal-polyfill`'s `Temporal.Now.instant()`, which is millisecond-resolution and `Date.now()`-backed.
Projection maintains it as a running **max** over applied event `(timestamp, deviceId)` pairs: canonical projection in `projection.ts` (`modified: event.timestamp > graph.metadata.modified ? … : …`) and incremental projection's `touchGraphMetadata` in `incremental-projection.ts` (guarded by `lwwWins`).
This max-fold is what makes `metadata.modified` converge under any event delivery order — the permutation-invariance guarantee mandated by `openspec/specs/graph-session/spec.md` ("Incremental projection converges under any delivery order").

The defect: because `modified` is millisecond-resolution, two commits within the same millisecond leave it **unchanged**.
A draft that captured `modified = T` before a same-millisecond parent commit still sees `modified = T` at commit time, so the equality check passes and the stale commit proceeds — the exact failure the check exists to prevent.

This is not hypothetical.
`packages/api-adapter/tests/draft-flow.test.ts` test 8.2 (concurrent-modification + re-preview) failed on real macOS CI when a fast `draft.create → apply → out-of-band mutation` round trip completed inside one millisecond; the concurrent-modification error never fired.
The test was stabilized with an artificial delay (PR #434) — a test-only stopgap.
This change replaces the token so the delay is no longer load-bearing and the guarantee holds under real concurrency.

Relevant constraints:

- **Shared `GraphSession` under concurrency.** The `agent-daemon-draft-preview` design (Decision 1) shares **one** `GraphSession` across all IPC connections in `apps/daemon`. `GraphSession.commit` is `async` with `await eventLog.appendEvents(...)` between reading `currentGraph` and updating it, and `currentGraph`/`mergeState` are module-closure mutable state. So concurrent commits from different connections are real, and any token scheme must be safe when two `commit()` calls interleave across that `await`.
- **Permutation invariance is load-bearing.** Any change to how a revision-relevant field is folded must not violate the convergence invariant, which is property-tested.
- **Opaque wire string.** `packages/api-adapter/src/ipc/ipc-schema.ts` types `DraftCreateResult.parentRevision` and `DraftCommitParams.expectedParentRevision` as `z.string()` over JSON-RPC. The external contract must stay an opaque string.
- **`metadata.modified` is also a human timestamp.** It is displayed and sorted on — `apps/web/src/test/generators/query-generators.ts` sorts by `metadata.modified`. Repurposing it as an opaque token would break that meaning.

## Goals / Non-Goals

**Goals:**

- Make the revision token unique per distinct graph state: two commits within the same wall-clock millisecond MUST produce distinct tokens, so a stale draft commit is always rejected.
- Keep the token an opaque string end to end, with zero code changes required in `@canopy/api-adapter`, `apps/daemon`, or `apps/cli`.
- Preserve permutation invariance and the existing convergence property-tests.
- Preserve `metadata.modified`'s human-timestamp semantics (display, query sorting) untouched.
- Be safe under concurrent commits through a single shared `GraphSession` without introducing a new mutable-counter race across the `commit()` `await`.

**Non-Goals:**

- No change to the JSON-RPC method set, param/result schemas, or handshake capabilities.
- No new persistence: the token is derived at projection time from the existing event log, not stored separately or added to any `EventLogStore` record.
- Not attempting to also fix the theoretically-possible out-of-order remote-ingest case where a lower-`EventId` event applies (see Risks) — that requires a full state hash and is disproportionate; it is no worse than today and is covered by commit-time revalidation.
- No change to `GraphSession.commit`'s own read-validate-append-project sequencing (its internal TOCTOU is a separate concern; this change only replaces the token DraftSession compares).

## Decisions

### Decision 1 — token is the running maximum applied `EventId`, exposed as `Graph.revision`

Add a `revision` field to the projected `Graph`, maintained as the running **maximum** `EventId` over applied events, folded in exactly the projection sites that currently update `metadata.modified`.
`DraftSession.getParentRevision()` returns `parentGraph.revision`; `DraftSession.commit()` compares `expectedParentRevision` against `parentGraph.revision`.

Why `EventId` is the right substrate:

- **Globally unique by construction.** `EventId` is a `uuidv7()`-generated branded string (`packages/graph/src/factories.ts`, `identifiers.ts`). Two events — even in the same millisecond — get distinct ids, so the same-millisecond collision that breaks the timestamp token cannot occur.
- **It is already the canonical ordering key.** `projectGraph` sorts by `eventId.localeCompare` and incremental projection breaks writer ties with `event.eventId > writer` (`incremental-projection.ts`). Lexicographic max over lower-case fixed-length UUIDv7 hex equals byte order equals the projection's own ordering, so "max applied `EventId`" is a natural, already-consistent quantity.
- **It fits the existing max-fold pattern.** Maintaining `revision = max(revision, event.eventId)` at each apply site is structurally identical to the `modified` max-fold and therefore converges under any delivery order by the same argument: a max over a totally-ordered value is order-independent, and a losing event (smaller id) cannot lower the max. This is why it does not violate permutation invariance. (The convergence proof mirrors `metadata.modified`'s: losers are dominated by the max, so whether a loser was ever transiently applied does not change the final token.)
- **UUIDv7 is time-ordered.** Locally minted commit events carry monotonically increasing ids in practice, so the token advances on every local commit — which is the OCC-relevant path.

Why a **new `Graph.revision` field** rather than repurposing `metadata.modified`:

- `metadata.modified` is a human "last modified" timestamp that is rendered and sorted on (`query-generators.ts` sorts by `metadata.modified`). Overwriting it with a UUID string would break display and any timestamp-ordered query. `revision` is not temporal, so it does not belong in `TemporalMetadata`; it is a sibling top-level field on `Graph` (`readonly revision: Revision`).
- Keeping the two separate makes the change additive and reversible, and lets each field mean exactly one thing.

Concurrency safety (shared `GraphSession`, interleaved `commit()`):

- `revision` is a **pure fold over event state**, not a side-effecting counter. It is computed inside projection from the events themselves, so there is no mutable increment that two interleaved `commit()` calls could race on (contrast Decision 3's rejected counter).
- Two commits that interleave across the `await eventLog.appendEvents` each carry their own freshly-minted, higher `EventId`s. After both merges land, `currentGraph.revision` is the max of all applied ids. A draft that captured the pre-commit revision sees a strictly greater revision after either commit and is correctly rejected. No token value is ever shared between two distinct post-commit states.

Seed value: an empty/bootstrap graph has no op events. `create-graph.ts` seeds `revision` with a fixed zero sentinel (an all-zero UUID string, branded `Revision`) that sorts below any real `EventId`. Bootstrap events (if any carry `EventId`s) then advance it via the same fold. The token is opaque, so the sentinel is never interpreted by clients.

### Decision 2 — the wire contract stays an opaque string; no adapter/daemon changes

`Revision` is a branded string (`string & { readonly [revisionBrand]: never }`, mirroring `EventId`). Over JSON-RPC it serializes as a plain string, matching the existing `z.string()` schemas for `parentRevision`/`expectedParentRevision`.

Consequences, confirmed against the code:

- `packages/api-adapter/src/ipc/ipc-handlers.ts` reads `getParentRevision()` and forwards its value into `DraftCreateResult.parentRevision`, and passes `expectedParentRevision` straight into `draft.commit(...)`. Both are opaque string pass-throughs; neither inspects the format. No handler change is required.
- `apps/daemon` never touches the token; it only wires the session and server. No change.
- The `concurrent-modification` error path already carries "the server's current parent revision" — that is now the new token, still a string, so re-fetch/rebase/retry flows are unaffected.

This is verified in tasks (a grep/type check that no adapter code depends on the token being a timestamp) rather than assumed.

### Decision 3 — rejected alternatives

**(a) A monotonic per-commit counter held in `GraphSession` closure state.**
Rejected on two independent grounds.
First, it is **not convergent**: a counter incremented as a side effect of the write path is a function of the application trace, not of graph state. Two sessions replaying the same log in different partitions/orders would disagree, and even "count applied events" is order-dependent — e.g. two property writes `e1 < e2` to the same key yield 2 applied in ascending order but 1 in descending order (the late lower write loses and is never applied), so the counter diverges. That breaks the permutation-invariance guarantee.
Second, it **races across the `await`**: `commit()` reads and writes closure state around `await eventLog.appendEvents`. Two interleaved commits can both observe counter `N` before either writes `N+1`, or append in one order and increment in another. A max-`EventId` fold has neither problem because it is derived from the events, not incremented in place.

**(b) A content hash of the full projected graph state (e.g. SHA-256 of a canonical serialization).**
This is the theoretically complete option: final graph state is convergent by the invariant, so `hash(state)` changes on _any_ state change, including the out-of-order remote-ingest case where a lower-`EventId` event still applies and the max-`EventId` token does not advance.
Rejected on cost and complexity disproportionate to the residual risk: hashing the whole graph is O(nodes + edges + properties) per commit/read, and requires a canonical serialization of `Map`s with stable key/property ordering — a new, easy-to-get-wrong surface. An incremental commutative accumulator (XOR/sum over per-event hashes) does not rescue it, because the _applied set itself_ is order-dependent (same `e1 < e2` example), so an accumulator over applied events is no more convergent than the counter. The only correct hash is over final state, at full cost. Given the residual max-`EventId` gap is (i) no worse than today's timestamp and (ii) already covered by commit-time revalidation, a full state hash is not justified now. Left as a possible future step if a real out-of-order-ingest collision is ever observed.

**(c) Higher-resolution timestamp (microseconds/nanoseconds).**
Rejected: `Temporal.Now.instant()` is `Date.now()`-backed at millisecond resolution in this environment, and even a higher-resolution clock only shrinks the collision window rather than eliminating it — two events can still collide, and clock non-monotonicity (NTP steps) can move the token backward. `EventId` is collision-free by construction and never moves backward for a given applied set.

## Adversarial review and mitigations

### Resource and performance overhead

- **Per-event cost.** The `revision` fold is O(1) per applied event — one branded-string comparison and assignment — identical cost to the existing `metadata.modified` max-fold it sits beside in the same apply sites. No additional per-event or per-commit overhead class.
- **No new storage.** `revision` is derived at projection time from `EventId`s already present in every event; it adds one small field to the in-memory `Graph` object (a single string), not a new persisted record, index, or `EventLogStore` write.
- **No change to overlay-projection cost.** `DraftSession.graph()`'s existing O(parent + staged) overlay projection (already bounded by the daemon's per-connection/global draft limits) is untouched — this change only replaces the OCC comparison value, not the projection algorithm's complexity.

### Failure modes and edge cases

- **[Residual out-of-order collision]** A remote event with an `EventId` _lower_ than the current max that nonetheless applies (e.g. an unrelated `NodeCreated` arriving late) changes graph state without advancing `max(EventId)`, so a stale draft could miss it. → **Mitigation:** this is strictly no worse than the status quo (`metadata.modified` misses the same lower-timestamp case identically), it does not affect the observed same-millisecond local bug this change fixes, and `session.commit` independently re-runs full structural/referential/type validation (`validateCommit`) so a missed conflict can still only add valid data, never corrupt invariants. The complete fix (state hash) is documented in Decision 3(b) as a deferred option, not silently dropped.
- **[Convergence regression]** A wrong fold (e.g. touching `revision` on a losing write, or using a non-max update) could break permutation invariance. → **Mitigation:** implement `revision` with the identical max-guard used for `metadata.modified` at every apply site, and extend the existing permutation-invariance property test to assert `revision` is identical across permutations (task 4.2).
- **[Missed apply site]** `metadata.modified` is updated in ~6 event cases across `projection.ts` and `incremental-projection.ts`; missing one leaves `revision` stale for that event type. → **Mitigation:** co-locate the `revision` fold with every `modified` update and add a unit test per op event type asserting the token advances; a single shared helper (e.g. `maxRevision(current, event.eventId)`) reduces the surface.
- **[Empty-graph token]** A bootstrap-only graph must still yield a stable, comparable token. → **Mitigation:** seed with a fixed zero-UUID sentinel that sorts below any real `EventId`; drafts against a fresh graph compare correctly and advance on first commit.
- **[Wire assumption drift]** A future change could start parsing the token as a timestamp. → **Mitigation:** the spec delta states the token is opaque; a test asserts the adapter forwards it without inspection, and `Revision` is a distinct brand so accidental use as an `Instant` fails to type-check.

### Security and isolation

- **No new trust boundary.** This is a pure `@canopy/graph` kernel data-representation change (one additional derived field on `Graph`), consumed unchanged by the same-user IPC surface that already trusted `metadata.modified` for the identical optimistic-concurrency purpose. It touches no validation, authentication, or transport code, and does not alter the daemon's UDS trust model.
- **No new forgery surface.** The token was already opaque and server-derived — a client only ever echoes back a value the server itself previously returned. Switching its internal representation does not give a client any new way to influence or forge a value `commit` will accept; the equality check still requires an exact match against the server's current computation.
- **No new information disclosure.** An `EventId` is already visible to any client with read access (every event and many entities expose one via `query.*`), so a token derived from a max over already-visible ids discloses nothing a same-user client couldn't already see.

### Migration and backward compatibility

- **Purely additive and backward-compatible.** `revision` is derived at projection time from the existing event log, so any existing vault produces a correct token on its next `load()`; no data migration, no `EventLogStore` change, no protocol version bump.
- **Rollback.** Revert the `@canopy/graph` changes and repoint `DraftSession` at `metadata.modified`. Nothing external depends on the token's internal shape (it stays an opaque string), so rollback is local to one package.
- **Deploy order.** Land `@canopy/graph` first (self-contained); `@canopy/api-adapter`/`apps/daemon` need no coordinated change. The stopgap delay in `packages/api-adapter/tests/draft-flow.test.ts` (PR #434) can be removed once the new token is in place (task 3.3).

## Open Questions

- Should `revision` live as a top-level `Graph.revision` field (recommended here, since it is not temporal) or inside a small non-temporal metadata bag? The design recommends the top-level field for minimal churn and clear semantics; final placement can be confirmed at implementation without changing the external contract.
- Whether to expose `revision` on the public read surface (queries) at all, or keep it internal to the draft/OCC path. Default: keep it out of query-sortable fields (unlike `metadata.modified`) since it is an opaque token, not a meaningful ordering for users.
