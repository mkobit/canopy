## Context and approval

This is a design draft for canopy-v9o.1.25 at base `0cad57cb67e77a6f5a4904b613496f7f02363609`, for branch `docs/canopy-v9o-1-25-design`.
Independent adversarial review, mitigations approval, and merged maintainer design approval are pending.
[PR #477](https://github.com/mkobit/canopy/pull/477) at `282d5b59bef455c569d2d18ba2e8e804f3a01cdf` approves the functional toolkit only and excludes runtime rewrites.
[PR #572](https://github.com/mkobit/canopy/pull/572) at `6480f626d8cd9a1f121a32d762f6b14af634b4a0` approves Effect 4 migration, which #575 landed, not this rewrite.
The [toolkit specification](../../specs/kernel-functional-toolkit/spec.md) permits Effect at this app boundary.
The [delivery design](../agent-delivery-boundaries/design.md), [delivery requirements](../agent-delivery-boundaries/specs/bounded-agent-delivery/spec.md), and [handoff template](../agent-delivery-boundaries/handoff-template.md) require separate approval before implementation.
Structural validation does not establish approval.

The [context map](../../../docs/architecture/bounded-contexts.md), [core tenets](../../../docs/architecture/core-tenets.md), and [host guidance](../../../apps/clip-host/AGENTS.md) place this host at the protocol adapter boundary.
It is a same-user stdio narrowing proxy to a Unix-socket daemon.
It owns framing, request rate state, method and namespace gates, and successful connection and type lookup state.
It does not own graph semantics or a new storage or write path.
All graph writes remain daemon commands through existing graph operations.
Preview, explicit confirmation, event history, persistence, and historical reconstruction remain unchanged under the [capture contract](../../specs/web-clip-capture/spec.md).
The [archived bridge design](../archive/2026-08-12-browser-extension-web-clipper/design.md) and [bridge requirements](../archive/2026-08-12-browser-extension-web-clipper/specs/native-messaging-bridge/spec.md) explain the existing trust boundary.

## Goals and non-goals

Preserve observable native-messaging and rate-limit behavior while removing directives through minimal functional transitions.
Retain all limiter, framing, and host public signatures except the app-internal `runClipHost` return described below.
Do not introduce a streaming architecture, broad Effect migration, speculative deduplication, or request serialization solely to satisfy lint.
Do not change rule settings, `ignoreTypePattern`, user configuration, or the disable ceiling in this design.

## Current directive inventory

Locations below refer to directive lines at the pinned base, not rewritten line numbers.
All rules with no prefix in the table have the `functional/` prefix, except `max-lines-per-function`.

| Source                                                         | Directive lines and rules                                                                            | Count |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----- |
| [rate-limiter.ts](../../../apps/clip-host/src/rate-limiter.ts) | 20 prefer-immutable-types; 26 no-loop-statements; 28 immutable-data; 34 immutable-data               | 4     |
| [framing.ts](../../../apps/clip-host/src/framing.ts)           | 57 no-let; 59 prefer-immutable-types; 62 no-loop-statements; 82 no-try-statements; 84 immutable-data | 5     |
| [index.ts](../../../apps/clip-host/src/index.ts)               | 1 file-wide no-return-void; 23 no-let; 46 no-loop-statements                                         | 3     |
| [host.ts](../../../apps/clip-host/src/host.ts)                 | 45 no-mixed-types; 162 max-lines-per-function; 165 no-let; 167 no-let                                | 4     |

The Bead lists 14 functional targets, but the source has 16 directives, including max-lines-per-function.
The source inventory, not that count, defines the 16 candidates here.

## Decisions

### Return the existing stdio registration result

Remove all 16 directives, including the file-wide `functional/no-return-void` directive.
Let `runClipHost` return the actual existing `process.stdin.on('data', handler)` registration result and infer its third-party return type.
This is a narrow internal TypeScript return change for review; runtime and wire behavior remain unchanged, and the current caller still ignores the result.
A bounded source search across `apps` and `packages` finds only its definition and ignored-return invocation in [index.ts](../../../apps/clip-host/src/index.ts).
The [package](../../../apps/clip-host/package.json) is private and bin-only, with no exports entry or source consumers found by that search.
[eslint.config.mjs](../../../eslint.config.mjs) enables `functional/no-return-void` and sets `functional/prefer-immutable-types` to `ignoreInferredTypes: true`.
The existing configuration permits the inferred registration result without a new ignore, exception, or rule change.
Node does not force void callback returns here.
Return meaningful existing values from internal callbacks, such as the stdout write result or dispatch promise array.
Do not add arbitrary constants or disguise state ownership.
All other public signatures remain unchanged under the [playbook](../../../docs/research/2026-08-15-eliminating-eslint-disables-playbook.md).

### Use immutable rate transitions with a private Ref

Use an Effect 4 `Ref.makeUnsafe` per limiter to hold a readonly timestamp array, and `Ref.modify` with `Effect.runSync` for each synchronous `tryAcquire`.
The Ref owns changing state; transitions do not mutate arrays or options.
Remove only the expired leading prefix with `findIndex` and `slice`, matching the current queue even for supplied non-monotonic times.
Keep the first timestamp equal to `now - windowMs` and every timestamp after it.
Append `now` only on success, and commit expiry removal even on rejection.
Retain the default `Temporal.Now.instant().epochMilliseconds` source, signature, and isolation.
This bounded array copy is proportional to retained successful acquisitions; introducing an asynchronous limiter would change the public contract.

### Decode with an iterative unfold

Use the installed Effect 4 `Array.unfold` with immutable cursor state to emit complete-frame records containing parsed results and their end offsets.
Stop before an incomplete prefix or body, and emit one terminal error record on an oversize prefix or malformed JSON.
Wrap only JSON parsing with `Effect.try`, convert its typed result to the existing graph `Result`, and keep synchronous public framing signatures.
Inspect records for an error before exposing any messages, then map successful records in order and take the remainder from the final complete end offset.
An error returns no partial results even after valid records in the same call.
Keep the 4-byte little-endian prefix, current 1 MiB cap, error reasons and messages, and input bytes unchanged.
Keep encoding unchanged unless a necessary lint-compatible internal refinement preserves its current behavior.
This uses the library's iterative array builder without a mutable application accumulator, recursion, or repeated full message-array copies.
Work is linear in bytes parsed plus frame count, with linear records and output storage.
A recursive parser risks stack overflow, and spreading the full message array on every frame risks quadratic work; reject both.
No new runtime or streaming layer is needed.

### Keep session state and dispatch ownership explicit

Use separate per-host Refs for successful connection and WebClip type identity, with readonly optional values.
Read inside each existing lazy Effect and set only after success.
Do not memoize in-flight Effects, cache failures, add locks, or reset a successful connection on a later dispatch error.
Concurrent cold requests can still perform concurrent connection or type lookups, and successful completion still updates the shared slot as today.
Split the long factory into private helpers for successful-state lookup and request gating with explicit dependencies.
Use an intersection of readonly configuration data and the optional connect-function object to retain the exact `ClipHostOptions` shape without a mixed member declaration.
Do not create a generic cache abstraction or move these helpers into the kernel.
Keep allowlist rejection before rate acquisition and connection, followed by connection, required type/namespace check, and dispatch.
Retain returned `webClipTypeId`, typed unavailable responses including captured connect defects, forwarded `error.data`, existing schemas, and `toWireEvent` for Map properties.

Use one per-process Ref for incomplete stdin bytes.
For each data callback, atomically decode the concatenated old remainder and new chunk, replace the remainder on success, and clear it on failure.
Dispatch the returned complete messages with `map` to start independent reply promises immediately, without awaiting the batch or serializing requests.
Preserve stdout as frames only and preserve the current response order determined by independent completion.
The Ref owns changing bytes; it is not an excuse to mutate input buffers.

### Use installed Effect 4 declarations

Effect is already pinned to `4.0.3` in [clip-host package metadata](../../../apps/clip-host/package.json).
Local `node_modules/effect/dist/Ref.d.ts` declares `makeUnsafe`, `get`, `set`, and `modify`.
Local `Effect.d.ts` declares `try`, `result`, `exit`, and `runSync`; `Array.d.ts` declares `unfold` with an Option of a readonly value/state tuple.
These declarations are API authority, not Effect 3 recipes.
If implementation cannot retain these contracts with current lint and types, stop dependent work and report the exact failing API, rule, and scenario to the owner.
Do not add an exemption, dependency, or alternate contract without renewed design review.

## Acceptance evidence and future checks

The [delta specification](specs/clip-host-functional-rewrite/spec.md) defines the exact required scenarios.
Existing tests establish starting evidence, not proof of the proposed implementation.

| Evidence                                                                                     | Current scope                                                                       | Future additions                                                                                                   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [framing.test.ts](../../../apps/clip-host/tests/framing.test.ts)                             | Round trip, combined frames, incomplete body, malformed data, size rejection        | Split prefixes and bodies, exact remainder and input immutability, valid then oversize rejection, many tiny frames |
| [rate-limiter.test.ts](../../../apps/clip-host/tests/rate-limiter.test.ts)                   | Capacity, elapsed window, host throttle                                             | Equality, rejected attempts, limiter isolation, non-monotonic supplied time                                        |
| [host-allowlist.test.ts](../../../apps/clip-host/tests/host-allowlist.test.ts)               | Method and namespace rejection, returned type id, Map conversion, daemon error data | Successful state reuse, retry after lookup failure, controlled concurrent cold requests and independent replies    |
| [daemon-unavailable.test.ts](../../../apps/clip-host/tests/daemon-unavailable.test.ts)       | Injected connection failure and rejection before connect                            | Failure then success and captured defect retry                                                                     |
| [ensure-webclip-type.test.ts](../../../apps/clip-host/tests/ensure-webclip-type.test.ts)     | Runtime authoring and reuse                                                         | Host type lookup failure then retry and successful cache reuse                                                     |
| [extension-capture-e2e.test.ts](../../../apps/clip-host/tests/extension-capture-e2e.test.ts) | Real daemon IPC through createClipHost, preview, commit, query                      | Separate real child-process stdin/stdout fragmentation and rejection recovery evidence                             |

The existing end-to-end test does not launch the host process or exercise stdin/stdout.
Keep valid-then-invalid all-or-nothing assertions in direct `decodeFrames` tests, where one call is explicit.
Stdin write calls do not define data-event or decode-call boundaries, and rejected bytes have no product acknowledgement.
Use a test-only child launcher that calls `runClipHost`, then registers a separate stdin data observer after the product listener.
The observer reports consumed chunk byte counts over a dedicated test-only IPC channel after the host synchronous data listener returns.
The launcher reports readiness after both listeners are registered.
For prefix and body fragmentation, the parent waits for consumption acknowledgements covering every byte of the previous fragment before sending the next fragment.
For recovery, send malformed or oversized input alone, wait for consumption acknowledgements covering all rejected bytes, then send a fresh valid frame and verify its framed reply.
Parse stdout as frames only, and test combined valid messages without assuming writer calls become one decoder call.
Do not add a product hook, stdout diagnostic, new protocol message, or production acknowledgement.
Use a controllable real Unix-socket peer for dispatch timing and real daemon IPC for capture integration.

Measure increasing batches of many tiny frames for ordered results, stack safety, elapsed time, and allocation growth, and review the unfold implementation for one append per record.
Do not impose invented timing thresholds.
The graph performance modules `indexes.ts` and `incremental-projection.ts` are untouched, so their benchmark requirement does not apply.

[Root scripts](../../../package.json), [host scripts](../../../apps/clip-host/package.json), and [mise tasks](../../../mise.toml) provide the check entry points.
Future implementation checks are `bun run build` before lint, `bunx eslint apps/clip-host`, `bun run --cwd apps/clip-host typecheck`, `bun run --cwd apps/clip-host test`, `bun tools/check-eslint-disable-ceiling.ts --update`, and full `mise run check`, plus the child-process evidence above.
There is no host workspace lint script.
Reserve `tools/eslint-disable-baseline.json` for the single integration writer at implementation time.
This draft runs only strict validation of this proposed change and Prettier on the four owned artifacts.

## Adversarial review and mitigations

### Resource/performance overhead

Per-request Ref runners and frame records add allocation and runtime overhead.
Keep synchronous runners limited to state transitions and parse error capture, and use iterative unfold with linear record collection.
Review increasing tiny-frame volume and retained rate arrays, record measured growth, and reject recursion or repeated full-array copies.
No graph benchmark is required because no graph performance module changes.

### Failure modes/edge cases

Boundary equality, rejection accounting, incomplete bytes, or a failed cache lookup can silently change behavior.
Use the exact delta scenarios for equality, rejection, fragment preservation, no partial results, failure retry, and concurrent cold requests.
Keep success-only state updates and current defect capture, and prove fresh-frame recovery with the test-only consumed-chunk IPC oracle.
Review listener registration order and wait for acknowledged byte counts before advancing fragments or recovery input.

### Security/isolation

Refactoring gates or wire conversion can widen access or drop validation data.
Retain gate order, unchanged method and namespace checks, and `toWireEvent` conversion.
Review the allowlist diff and use denial, returned type id, Map properties, and error-data assertions plus real daemon capture evidence.
Introduce no listener, permission, method, dependency, schema, kernel type, or new graph write path.

### Migration/backward compatibility

An asynchronous limiter, serialized replies, or in-flight cache can break existing clients.
Keep all other public signatures and current independent dispatch and successful-state reuse semantics.
Review the narrow inferred `runClipHost` registration return against the bounded consumer search and existing ignored-return call.
Use controlled concurrency tests and signature review to confirm unchanged runtime and wire behavior.
No protocol, storage, manifest, or data migration is needed, and rollback restores only the implementation and its acceptance tests.

## Approval and escalation

Independent adversarial review and maintainer approval remain pending for the design above, including the internal return change.
Withhold `tasks.md`, implementation packet staging, implementation Beads, and implementation until independent adversarial review and merged design approval.
The host coordinator owns authoritative Beads updates, commits, push, PR creation, merge, closure, and shared baseline changes.
This worker owns only four temporary design artifacts and returns evidence without repository writes.
If a compatible implementation cannot remove all 16 directives, report the exact API, lint failure, and affected scenario to the owner instead of adding an exception.
