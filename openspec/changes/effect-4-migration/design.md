# Effect 4 migration design

Status: proposed; approval takes effect only when the root integration owner merges the design PR.

Review baseline: `main` at `87f47ba99db0acde59f6ed6ebabf085c412faf39`.

## User outcome

Developers can build Canopy with one compatible Effect 4 package family.
CLI users keep the same commands and results.
IPC clients keep the same wire behavior.
Daemon users keep the same startup, signal handling, and shutdown behavior.

## Current implementation and contracts

The failed version-only dependency attempts are documented in [PR #567](https://github.com/mkobit/canopy/pull/567) and [PR #574](https://github.com/mkobit/canopy/pull/574).
PR #574 remains unmerged and is not this proposal.
It used `effect@4.0.0` and `@effect/platform-node@4.0.0` while retaining Effect 3 `@effect/platform@0.97.2` and `@effect/cli@0.77.2`.
Its CI log reports a type error and runtime failure at `Effect.async` in [the IPC client](../../../packages/api-adapter/src/ipc/ipc-client.ts).
The later daemon socket timeout follows this client failure and does not prove a separate shutdown fault.

The [core tenets](../../../docs/architecture/core-tenets.md), [core data model](../../../docs/design/2026-02-06-core-data-model.md), and [bounded-context map](../../../docs/architecture/bounded-contexts.md) remain authoritative.
The [IPC transport specification](../../specs/unix-socket-ipc-transport/spec.md), [daemon host specification](../../specs/agent-daemon-host/spec.md), and [event persistence specification](../../specs/event-log-persistence/spec.md) define the observable contracts.
The migration stays in the adapter, CLI, daemon, and clip-host contexts.
It must not add Effect to `@canopy/graph` or change graph semantics.

## Proposed package set

Pin direct `effect` dependencies to `4.0.3` in `@canopy/api-adapter`, `apps/cli`, `apps/daemon`, and `apps/clip-host`.
Pin direct `@effect/platform-node` dependencies to `4.0.3` in `apps/cli` and `apps/daemon`.
Remove direct `@effect/cli` and `@effect/platform` dependencies from the CLI and daemon.
Keep `@effect/platform-node-shared` transitive rather than adding it as an application dependency.
Use a root `package.json` override for `@effect/platform-node-shared@4.0.3` because `@effect/platform-node@4.0.3` declares the compatible range `^4.0.3` and the migration requires an exact, recorded closure.
Record the complete resolved dependency closure and inspect the package metadata for every resolved Effect-family package.
Require `effect@4.0.3`, `@effect/platform-node@4.0.3`, and `@effect/platform-node-shared@4.0.3` in the closure, with every declared peer range accepting its resolved peer version.
The reviewed metadata declares the `effect` peer at `^4.0.3` and a `redis` peer range of `>=5 <7`.
Validate peer requirements against the exact package metadata and frozen resolved closure; do not add or guess a peer dependency to force a resolution.
Record each required peer that resolves, and stop for design review if a required peer cannot be satisfied by the reviewed closure.
Require the closure to contain no Effect 3 runtime or peer-package instances.
Derive the Effect-family package list from the resolved closure and its metadata; do not guess names or pin unrelated transitive packages.
Run a frozen install and an explicit peer validation because a successful Bun install alone does not prove peer compatibility.
Stop implementation and return to design if the proposed direct pins and the single shared-package override cannot produce this compatible closure without unrelated upgrades or pin drift.
Update the manifests, lockfile, and dependency instructions together.
This package policy becomes approved only when the root integration owner merges the design PR.

The official [4.0.3 release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.3) is commit `967a7dc` and lists synchronized package versions.
Its [package metadata](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/package.json) exports `effect/cli`.
The stable `effect@4.0.0` tag points to `67ba4e4`; `2c552f2` is the announcement commit.
Use the exact `4.0.3` tag sources for APIs in this proposal.

## Consumer and API migration

In [the IPC client](../../../packages/api-adapter/src/ipc/ipc-client.ts), replace connection setup's `Effect.async` with the pinned `Effect.callback` API from `effect`.
Preserve the current typed IPC errors and callback-at-most-once behavior.
Current behavior: interruption during connection setup has no specified cleanup guarantee; requests are started by `Effect.tryPromise` and tracked in a shared pending map; socket `error` rejects pending requests; clean peer close has no close handler and leaves pending entries and waits unsettled; explicit `client.close()` clears the map and destroys the socket without rejecting the promises first.
Proposed behavior correction: cancellation of one pending request removes only that request's correlation ID and callback, ignores a later response for that ID, and leaves the shared socket, other requests, and subscriptions usable.
Peer close, peer error, and explicit client close settle every remaining pending request exactly once with a typed `IpcClientError`, clear pending requests and subscriptions, and release the socket and its listeners once.
The close and error mapping must match the existing error-path mapping where one exists; clean close and explicit close must use a deterministic typed error instead of leaving waits pending.
Interruption during connection setup releases the connection attempt's socket and listeners and prevents duplicate completion.
Add real-socket tests that hold one request, interrupt it, complete a second request on the same client, and then deliver and ignore the late response.
Also test clean peer close, peer error, and explicit close while multiple requests wait; assert all waits settle once with typed errors and that client cleanup does not affect another client.
Do not add a production request timeout or change the IPC wire protocol.
Use a cancellation-aware pinned Effect boundary for each request wait so interruption runs a finalizer that removes that request's pending entry.
Do not rely on `Effect.tryPromise` around a Promise that cannot cancel or unregister its pending entry.
The request registration owns its correlation ID and callback; the client registration owns the shared socket and its data, error, close, and listener cleanup.
Return a cancellation finalizer from callback registration for the resources owned by that registration.
The pinned [callback API source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/Effect.ts) and [migration map](https://github.com/Effect-TS/effect/blob/effect%404.0.3/migration/v3-to-v4.md) are the signature authority.

In [the CLI commands](../../../apps/cli/src/commands), import `Command`, `Flag`, and `Argument` from `effect/cli`.
Map `Options.text` to `Flag.String`, `Options.integer` to `Flag.Int`, `Options.boolean` to `Flag.Boolean`, `Options.choice` to `Flag.Literals`, and optional/default/description combinators to `Flag.optional`, `Flag.withDefault`, and `Flag.withDescription`.
These constructors and combinators are marked unstable in v4.0.3, so pin their use to this exact release and verify generated help output.
The pinned [CLI Flag source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/unstable/cli/Flag.ts) defines these names.
The CLI consumer boundary includes [the root entrypoint](../../../apps/cli/src/index.ts), [shared options](../../../apps/cli/src/options.ts), every command module under `apps/cli/src/commands`, and the four command test files listed below.
Preserve root `Command.run` handling of live `process.argv`; migrate tests that pass explicit arrays to the pinned explicit-argv runner, `Command.runWith`, after verifying its signature.
Map every existing `Options` constructor and combinator in commands and shared options, including text, integer, boolean, choice, optional, default, and description behavior.
Keep command names, descriptions, positional arguments, defaults, help text, output, error behavior, and exit behavior unchanged.
Keep `Command.make`, `Command.withDescription`, and `Command.withSubcommands` where the pinned APIs confirm their signatures.
Use the pinned [Command source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/unstable/cli/Command.ts) to verify live-process and explicit-argv invocation semantics before editing.
The stable public import is `effect/cli`, not `effect/unstable/cli`.

In the CLI and [daemon entrypoint](../../../apps/daemon/src/index.ts), replace `NodeContext.layer` with the verified v4 `NodeServices.layer` from `@effect/platform-node`.
Keep `NodeRuntime.runMain` from `@effect/platform-node` if its pinned signature remains compatible.
The [platform-node 4.0.3 package metadata](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/package.json) and [Node runtime source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/src/NodeRuntime.ts) must be checked during implementation.
Confirm the layers required by CLI execution are supplied by the chosen Node layer before relying on it.
The daemon entrypoint also defines its own root `Command`, optional socket and database flags, the default ephemeral flag, foreground `bootDaemon` execution, and `Command.run` handling of live `process.argv`; preserve these behaviors and verify daemon help, invalid flags, defaults, startup errors, and output.
The consumer set includes [daemon tests and support](../../../apps/daemon/tests), not only the entrypoint.

In [clip-host](../../../apps/clip-host/src/host.ts), replace `Effect.either` with `Effect.result` and map the old `Left` and `Right` branches to `Failure` and `Success`.
Use `.failure` and `.success` payload fields as defined by the pinned [Result source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/Result.ts).
Keep `Effect.exit` handling separate because it returns `Exit`, not `Result`.

In [the CLI status command](../../../apps/cli/src/commands/status.ts) and [events command](../../../apps/cli/src/commands/events.ts), replace `Effect.either` with `Effect.result`.
Map `Left` and `Right` branches to `Failure` and `Success` and read `.failure` and `.success` payloads.
Preserve the current error text, command exit behavior, and client close behavior on both branches.
Add or retain assertions for each branch in the command tests.

In [CLI command tests](../../../apps/cli/tests/cli-commands.test.ts), [type and query tests](../../../apps/cli/tests/types-and-query-commands.test.ts), [events tests](../../../apps/cli/tests/events-command.test.ts), and [status tests](../../../apps/cli/tests/status-command.test.ts), replace `@effect/cli` imports with `effect/cli` and `NodeContext.layer` with `NodeServices.layer`.
Replace `Command.run` test invocations that pass explicit argument arrays with `Command.runWith` using the exact argv arrays.
Check the pinned [Command source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/unstable/cli/Command.ts) for its curried signature.
Keep every existing assertion and add no skipped or weakened assertions.

Keep `Effect.acquireRelease`, `Effect.scoped`, `Effect.runPromise`, `Effect.tryPromise`, and the other APIs whose pinned migration entry and source retain their use.
Do not migrate `Stream` APIs because current consumers do not import Effect `Stream`.
Names such as `Stream.subscribe` in the IPC code are protocol methods, not Effect stream APIs.

## Compatibility and persistence

This migration changes Effect APIs and package dependencies only.
It does not change event schemas, order, IDs, storage adapters, replay rules, authorization, or transport messages.
Every graph mutation continues through `GraphSession.commit`.
The real persistence check must write a mutation through the Unix socket, close the daemon, restart it with the same SQLite file, and read the resulting graph state.
Add this as `apps/daemon/tests/host-persistence.test.ts`, or extend the existing host test only if its setup can prove the same restart boundary.

## Shutdown and cancellation

Keep the IPC server inside a scoped resource.
The current [shutdown test](../../../apps/daemon/tests/host-shutdown.test.ts) covers `SIGINT` only and connects then destroys a probe socket before sending the signal.
Extend it to cover both signals while a real client remains connected and holds a live subscription.
For each signal, assert that the client observes connection closure, the subscription receives no further delivery, the daemon exits successfully within a bounded timeout, and the socket path is removed.
Use an independent client or host to show that cleanup of the tested connection does not disturb unrelated clients where the contract permits continued operation.
If the process exceeds its timeout, force-kill it during test cleanup and fail the test.
Extend [the existing second-listener test](../../../apps/daemon/tests/host-second-listener.test.ts) to exercise the real daemon child against an incumbent socket.
Use a temporary SQLite database path for the failing child and the incumbent's occupied socket path.
Assert that the child exits nonzero within a bounded timeout after `startHost` opens and loads SQLite, then `server.listen()` returns `IpcSocketInUseError`.
Assert that the incumbent socket remains present and its connected client's requests still succeed.
After the failed child exits, start a new daemon with the same database path and a fresh socket path, then verify a successful client request.
The existing failure branch in [the daemon host](../../../apps/daemon/src/host.ts) closes the event log when `server.listen()` fails.
The test proves process exit and path reuse; it does not claim that restart alone proves the database handle closed before process exit.
Do not add a startup signal race, test seam, or production instrumentation for this dependency migration.
The pinned [Node runtime source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/src/NodeRuntime.ts) and official [runtime guide](https://effect.website/docs/v4/platform/runtime) confirm that `runMain` handles `SIGINT` and `SIGTERM` interruption.

## Acceptance evidence

Run the ordered quality gates: `bun install --frozen-lockfile`, `bun run build`, `bun run lint`, `bun run typecheck`, and `bun run test`.
The integration owner must run `sbx env exec .sbx/sbxenv.yaml -- mise run check` on the integrated result.
Run IPC load tests from `packages/api-adapter/tests/ipc-server-streaming.load.test.ts`.
Preserve its existing limits: 50 clients × 20 handshakes must finish in under 10 seconds, and 25 subscribers × 50 mutations must finish in under 5 seconds.
Record completions and peak memory with the run; paired base-versus-migration timing is informative and does not add a new regression threshold.
Run the real Unix socket tests in `packages/api-adapter/tests/ipc-client.test.ts`.
Add coverage for interruption before connection establishment and assert that the connection attempt releases its socket and listeners without duplicate completion.
Extend them to cover request interruption with a second request succeeding on the same client, ignored late response, clean peer close, peer error, and explicit client close with multiple pending requests.
Assert typed errors, once-only settlement, per-request removal, listener/socket release, and continued use of unrelated clients.
Run `apps/daemon/tests/host-persistence.test.ts` for SQLite persistence across restart.
Run `apps/daemon/tests/host-shutdown.test.ts` for both signals, exit status, and socket cleanup.
Run `apps/daemon/tests/host-second-listener.test.ts` for occupied-socket startup failure, incumbent-client continuity, bounded nonzero child exit, and database path reuse with a fresh socket path.
Run the CLI integration tests in `apps/cli/tests/cli-commands.test.ts`, `events-command.test.ts`, `status-command.test.ts`, and `types-and-query-commands.test.ts`.
Capture current CLI help, invalid-argument, default-option, command-error, and successful output before migration, then compare the same invocations after migration.
Run real CLI and daemon entrypoint smoke checks for help, invalid flags, option defaults, errors, output, and exit status.
The CLI check must cover root live-`process.argv` execution and explicit argv arrays used by tests.
The daemon check must cover its root command, optional socket and database paths, default `--ephemeral` value, foreground boot, startup error, and signal shutdown.
Check `bun pm ls --all`, every consumer manifest, the frozen lockfile, resolved package metadata, and all resolved peer ranges for a single compatible Effect 4 family and no Effect 3 runtime or peer-package instances.
Record the resolved closure and metadata validation result with the evidence.
Do not pin all transitive packages to force a result.
If the direct pins cannot resolve to the approved compatible closure, stop and return to design rather than silently upgrading packages or changing pins.
Lint must pass without added suppressions, immutable-rule weakening, or a higher ESLint disable ceiling.

## Adversarial review and mitigations

### Resources and performance

Effect 4 can change allocation, startup time, memory use, and socket throughput.
Mitigation: run the existing IPC load tests with their current limits of 10 seconds for 1,000 handshakes and 5 seconds for 1,250 subscription pushes.
Record peak resident memory and completed operations for both the approved base and migration under the same SBX environment.
Do not create a new percentage regression limit without owner approval.
Keep the load tests green at their existing limits and investigate any newly failing run before approval.
Map this mitigation to the exact acceptance scenarios for concurrent handshakes and subscription pushes in the existing IPC load test.

### Failures and edge cases

The callback API can change resumption, typed failure, interruption, or finalizer order.
A disconnect during an in-flight request can leak a listener or leave a request pending.
Current request promises may remain pending after clean peer close or explicit client close because those paths clear the map without rejecting its entries.
The proposed adapter correction settles those waits once with a typed error, removes an interrupted request by its own correlation ID, ignores its late response, and preserves the shared connection for unrelated work.
Mitigation and acceptance: the real-socket request-interruption scenario in `packages/api-adapter/tests/ipc-client.test.ts` proves one request is removed, a second request succeeds on the same client, and the late response is ignored.
The real-socket peer-disconnect scenarios in that test cover clean close and error, assert all remaining waits settle once with typed errors, and compare error mapping with the existing error path where defined.
The explicit-close scenario asserts the same settlement and resource cleanup without changing another client.
The daemon signal scenario in `apps/daemon/tests/host-shutdown.test.ts` retains a connected client and live subscription through each signal, then observes closure and no further delivery.
The IPC transport specification requires automatic subscription cleanup on client disconnect and slow-consumer drain timeout.
The current test tree has no slow-consumer drain-timeout test; the server implements a 15-second drain timeout in `packages/api-adapter/src/ipc/ipc-server.ts`.
Add a real-socket test that exercises the existing timeout boundary, then assert subscription termination, no further delivery, and continued delivery to an unaffected client.
Do not add a production test hook or new server instrumentation for this check.
The occupied-socket startup-failure scenario in `apps/daemon/tests/host-second-listener.test.ts` covers SQLite acquisition, listen failure, incumbent-client continuity, child exit, and path reuse.
Use bounded child-process timeouts and force-kill only as failure cleanup.
The IPC request lifecycle behaviors are proposed adapter corrections.
The daemon signal test preserves the existing host contract, and the occupied-socket test exercises the existing startup failure cleanup path.

### Security and isolation

The migration must not change socket permissions, path validation, authorization, or plugin boundaries.
Effect is not an authorization boundary.
Mitigation: preserve socket permission and access-control tests.
Keep transport input validation and error translation in `@canopy/api-adapter`.
Review the recorded resolved package closure, every Effect-family package manifest, peer ranges, and runtime imports for incompatible or unintended package instances.
This maps to the frozen-install package-family scenario and fails if any resolved Effect 3 runtime or peer package instance remains.

### Migration and backward compatibility

Effect 4 is a major release with package consolidation and API changes.
An incomplete upgrade can leave mixed package instances or change CLI behavior.
Mitigation: update all four source consumers in one dependency change and remove the old CLI/platform packages from direct manifests.
Verify the exact approved direct versions, frozen lockfile, full resolved package closure, and peer metadata after frozen install.
Compare captured CLI behavior and preserve the IPC contract and event log through the persistence restart test.
The root integration owner approves this design only by merging the design PR after independent adversarial review.
That merge approves the proposal but does not authorize tasks, Beads, or implementation dispatch.
The integration owner must then create the bounded-delivery packet and verify prerequisites and contracts before staging or dispatching implementation.

## Approval boundary

The exact package set and `4.0.3` direct pins become approved decisions only when the root integration owner merges the design PR.
The CLI layer composition still requires compile-time and behavior checks against pinned sources during implementation.
The public API is under `effect/cli`; earlier prerelease guidance about `effect/unstable/cli` does not apply to this stable package release.
The review baseline is `main` at `87f47ba99db0acde59f6ed6ebabf085c412faf39`.
No unresolved owner decision remains within this proposal after the authorized design merge.
The later bounded-delivery packet governs implementation scope, ownership, checks, and authority.

## Repository sources

- [Core tenets](../../../docs/architecture/core-tenets.md).
- [Core data model](../../../docs/design/2026-02-06-core-data-model.md).
- [Bounded contexts](../../../docs/architecture/bounded-contexts.md).
- [IPC specification](../../specs/unix-socket-ipc-transport/spec.md).
- [Daemon host specification](../../specs/agent-daemon-host/spec.md).
- [Event persistence specification](../../specs/event-log-persistence/spec.md).

## Upstream sources

- [Effect 4.0.3 release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.3), commit `967a7dc`.
- [Effect 4.0.3 package exports](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/package.json).
- [Effect 4.0.3 migration guide](https://github.com/Effect-TS/effect/blob/effect%404.0.3/MIGRATION.md).
- [Effect 4.0.3 migration map](https://github.com/Effect-TS/effect/blob/effect%404.0.3/migration/v3-to-v4.md).
- [Effect 4.0.3 Effect API](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/Effect.ts).
- [Effect 4.0.3 CLI Flag API](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/unstable/cli/Flag.ts).
- [Effect 4.0.3 CLI Command API](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/unstable/cli/Command.ts).
- [Effect 4.0.3 Result API](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/Result.ts).
- [Effect 4.0.3 platform-node package](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/package.json).
- [Effect 4.0.3 Node runtime API](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/src/NodeRuntime.ts).
- [Effect platform-node 4.0.3 registry metadata](https://registry.npmjs.org/@effect%2Fplatform-node/4.0.3).
- [Effect platform-node-shared 4.0.3 registry metadata](https://registry.npmjs.org/@effect%2Fplatform-node-shared/4.0.3).
- [Bun dependency overrides](https://bun.sh/docs/pm/overrides).
- [Official Effect v4 runtime guide](https://effect.website/docs/v4/platform/runtime), checked on 2026-10-17.
