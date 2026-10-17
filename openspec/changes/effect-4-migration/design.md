# Effect 4 migration design

Status: draft for owner review.

## User outcome

Developers can build Canopy with one compatible Effect 4 package family.
CLI users keep the same commands and results.
IPC clients keep the same wire behavior.
Daemon users keep the same startup, signal handling, and shutdown behavior.

## Current implementation and contracts

The failed dependency update used `effect@4.0.0` and `@effect/platform-node@4.0.0` while retaining Effect 3 `@effect/platform@0.97.2` and `@effect/cli@0.77.2`.
Its CI log reports a type error and runtime failure at `Effect.async` in [the IPC client](../../../packages/api-adapter/src/ipc/ipc-client.ts).
The later daemon socket timeout follows this client failure and does not prove a separate shutdown fault.

The [core tenets](../../../docs/architecture/core-tenets.md), [core data model](../../../docs/design/2026-02-06-core-data-model.md), and [bounded-context map](../../../docs/architecture/bounded-contexts.md) remain authoritative.
The [IPC transport specification](../../specs/unix-socket-ipc-transport/spec.md), [daemon host specification](../../specs/agent-daemon-host/spec.md), and [event persistence specification](../../specs/event-log-persistence/spec.md) define the observable contracts.
The migration stays in the adapter, CLI, daemon, and clip-host contexts.
It must not add Effect to `@canopy/graph` or change graph semantics.

## Proposed package set

Pin `effect@4.0.3` in `@canopy/api-adapter`, `apps/cli`, `apps/daemon`, and `apps/clip-host`.
Pin `@effect/platform-node@4.0.3` in `apps/cli` and `apps/daemon`.
Remove direct `@effect/cli` and `@effect/platform` dependencies from the CLI and daemon.
Keep any platform-node shared package transitive and verify its peer range resolves to this Effect version.
Update the manifests, lockfile, and dependency instructions together.
This is a proposed maintainer choice and requires owner approval.

The official [4.0.3 release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.3) is commit `967a7dc` and lists synchronized package versions.
Its [package metadata](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/package.json) exports `effect/cli`.
The stable `effect@4.0.0` tag points to `67ba4e4`; `2c552f2` is the announcement commit.
Use the exact `4.0.3` tag sources for APIs in this proposal.

## Consumer and API migration

In [the IPC client](../../../packages/api-adapter/src/ipc/ipc-client.ts), replace `Effect.async` with `Effect.callback` from `effect`.
Preserve the current typed IPC errors.
Return a cancellation finalizer from the callback registration when interruption must unregister a listener, close a socket, or stop pending work.
Ensure callback resumption happens at most once.
The pinned [callback API source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/Effect.ts) and [migration map](https://github.com/Effect-TS/effect/blob/effect%404.0.3/migration/v3-to-v4.md) are the signature authority.

In [the CLI commands](../../../apps/cli/src/commands), import `Command`, `Flag`, and `Argument` from `effect/cli`.
Map `Options.text` to `Flag.String`, `Options.integer` to `Flag.Int`, `Options.boolean` to `Flag.Boolean`, `Options.choice` to `Flag.Literals`, and optional/default/description combinators to `Flag.optional`, `Flag.withDefault`, and `Flag.withDescription`.
These constructors and combinators are marked unstable in v4.0.3, so pin their use to this exact release and verify generated help output.
The pinned [CLI Flag source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/unstable/cli/Flag.ts) defines these names.
Keep command names, descriptions, positional arguments, defaults, help text, and exit behavior unchanged.
Keep `Command.make`, `Command.withDescription`, and `Command.withSubcommands` where the pinned APIs confirm their signatures.
Use the pinned [Command source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/src/unstable/cli/Command.ts) to verify invocation semantics before editing.
The stable public import is `effect/cli`, not `effect/unstable/cli`.

In the CLI and [daemon entrypoint](../../../apps/daemon/src/index.ts), replace `NodeContext.layer` with the verified v4 `NodeServices.layer` from `@effect/platform-node`.
Keep `NodeRuntime.runMain` from `@effect/platform-node` if its pinned signature remains compatible.
The [platform-node 4.0.3 package metadata](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/package.json) and [Node runtime source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/src/NodeRuntime.ts) must be checked during implementation.
Confirm the layers required by CLI execution are supplied by the chosen Node layer before relying on it.

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
On `SIGINT` and `SIGTERM`, close the listener, destroy active connections, clear subscriptions, and remove the socket path before a successful exit.
The current [shutdown test](../../../apps/daemon/tests/host-shutdown.test.ts) covers `SIGINT` only.
Extend it with a real `SIGTERM` case that asserts exit status and socket cleanup.
If the process exceeds its timeout, force-kill it so the test cannot hang, then report the timeout as a failure.
The pinned [Node runtime source](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/platform/node/src/NodeRuntime.ts) and official [runtime guide](https://effect.website/docs/v4/platform/runtime) confirm that `runMain` handles `SIGINT` and `SIGTERM` interruption.

## Acceptance evidence

Run the ordered quality gates: `bun install --frozen-lockfile`, `bun run build`, `bun run lint`, `bun run typecheck`, and `bun run test`.
The integration owner must run `sbx env exec .sbx/sbxenv.yaml -- mise run check` on the integrated result.
Run IPC load tests from `packages/api-adapter/tests/ipc-server-streaming.load.test.ts`.
Preserve its existing limits: 50 clients × 20 handshakes must finish in under 10 seconds, and 25 subscribers × 50 mutations must finish in under 5 seconds.
Record completions and peak memory with the run; paired base-versus-migration timing is informative and does not add a new regression threshold.
Run the real Unix socket tests in `packages/api-adapter/tests/ipc-client.test.ts`.
Run `apps/daemon/tests/host-persistence.test.ts` for SQLite persistence across restart.
Run `apps/daemon/tests/host-shutdown.test.ts` for both signals, exit status, and socket cleanup.
Run the CLI integration tests in `apps/cli/tests/cli-commands.test.ts`, `events-command.test.ts`, `status-command.test.ts`, and `types-and-query-commands.test.ts`.
Capture current help, invalid-argument, and command output before migration, then compare the same invocations after migration.
Check `bun pm ls --all` and manifests for one Effect 4 family and no unintended Effect 3 `@effect/cli` or `@effect/platform` dependency.
Lint must pass without added suppressions, immutable-rule weakening, or a higher ESLint disable ceiling.

## Adversarial review and mitigations

### Resources and performance

Effect 4 can change allocation, startup time, memory use, and socket throughput.
Mitigation: run the existing IPC load tests with their current limits of 10 seconds for 1,000 handshakes and 5 seconds for 1,250 subscription pushes.
Record peak resident memory and completed operations for both the approved base and migration under the same SBX environment.
Do not create a new percentage regression limit without owner approval.
Keep the load tests green at their existing limits and investigate any newly failing run before approval.

### Failures and edge cases

The callback API can change resumption, typed failure, interruption, or finalizer order.
A disconnect during an in-flight request can leak a listener or leave a request pending.
Mitigation: test connection failure, disconnect during request, server close with active clients, slow-consumer cleanup, and interruption during startup.
Assert each callback settles at most once and each acquired resource is released.
Test both operating-system signals against a real child process.

### Security and isolation

The migration must not change socket permissions, path validation, authorization, or plugin boundaries.
Effect is not an authorization boundary.
Mitigation: preserve socket permission and access-control tests.
Keep transport input validation and error translation in `@canopy/api-adapter`.
Review the resolved package graph and runtime imports for unintended packages.

### Migration and backward compatibility

Effect 4 is a major release with package consolidation and API changes.
An incomplete upgrade can leave mixed package instances or change CLI behavior.
Mitigation: update all four source consumers in one dependency change and remove the old CLI/platform packages from direct manifests.
Verify the resolved package graph after frozen install.
Compare captured CLI behavior and preserve the IPC contract and event log through the persistence restart test.
Do not start implementation until the design has owner approval and independent adversarial review.

## Uncertainty and owner approval

The exact package set and `4.0.3` pin are proposed maintainer choices, not approved decisions.
The CLI layer composition needs compile-time and behavior checks against the pinned source before implementation.
The public API is under `effect/cli`; earlier prerelease guidance about `effect/unstable/cli` does not apply to this stable package release.
The owner must approve the migration goal, package set, scope, and acceptance evidence before implementation planning.

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
- [Official Effect v4 runtime guide](https://effect.website/docs/v4/platform/runtime), checked on 2026-10-17.
