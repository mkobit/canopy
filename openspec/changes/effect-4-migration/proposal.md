# Migrate the Effect package family to Effect 4

Status: draft for owner review.

Repository base: `origin/main` at `43504ba9c62882d32529015db6a94e821b4c3a4c`.
The failed dependency update is `origin/dependabot/bun/functional-768120836b` at `8006d7f6133f632df97d6b89069aa26c3e17de95`.

## Why

Upgrade Canopy's Effect users as one compatible dependency family.
Preserve current CLI output, daemon lifecycle, IPC protocol, graph operations, and persisted events.

The dependency update crossed from Effect 3 to Effect 4 without migrating its APIs.
CI reports that `Effect.async` is missing in [the IPC client](../../../packages/api-adapter/src/ipc/ipc-client.ts) and its runtime test fails for the same call.
This shows that a version-only update does not migrate the API surface.

## What changes

The known source consumers are `@canopy/api-adapter`, `apps/cli`, `apps/daemon`, and `apps/clip-host`.
The [clip host](../../../apps/clip-host/src/host.ts) consumes Effect APIs but does not consume the CLI API.
The migration must inspect the complete package closure at the approved base.

Use `effect@4.0.3` and, where required, `@effect/platform-node@4.0.3` as the proposed exact package set.
Remove `@effect/cli` and `@effect/platform` because the stable Effect package exports the CLI and consolidated platform modules under `effect/*`.
The official repository identifies its Effect packages as synchronized releases, and the `effect@4.0.3` release includes `@effect/platform-node@4.0.3`.
This is a proposed maintainer choice, not an owner-approved package policy.

## Capabilities

- Effect consumers build against a single, compatible Effect 4 dependency family.
- Application and adapter packages build and run against one pinned Effect 4 family.
- CLI commands preserve their arguments, output, and exit behavior.
- IPC requests and persisted graph events preserve their current contracts.
- The daemon keeps scoped shutdown on `SIGINT` and `SIGTERM`.

## Impact

Update Effect package manifests, imports, consumers, tests, and the lockfile as one coordinated change.
No graph, persistence, authorization, or wire-protocol change is intended.
No implementation is authorized until the owner approves the design and independent adversarial review is complete.

## Goals

- Keep all current CLI commands, arguments, output, and exit behavior.
- Keep IPC method names, JSON-RPC framing, capability negotiation, error mapping, and socket permissions.
- Keep the daemon in the foreground and preserve scoped shutdown on `SIGINT` and `SIGTERM`.
- Keep graph mutations on `GraphSession.commit` and reads on the existing query path.
- Preserve event-log content and replay behavior.
- Keep Effect types immutable and retain `Result<T, E>` domain boundaries.
- Add no ESLint suppression and do not raise the disable ceiling.

## Non-goals

- Change graph, event, persistence, authorization, or IPC semantics.
- Change the daemon launch or supervision model.
- Support Effect 3 and Effect 4 at the same time.
- Upgrade unrelated dependencies.
- Treat an upstream performance claim as proof of Canopy performance.

## Current contracts

The [core tenets](../../../docs/architecture/core-tenets.md) define the event log as the persistence and sync mechanism.
The [core data model](../../../docs/design/2026-02-06-core-data-model.md) defines immutable graph updates and event replay.
The [bounded-context map](../../../docs/architecture/bounded-contexts.md) assigns transport behavior to `@canopy/api-adapter`, CLI ownership to `apps/cli`, and server lifecycle to `apps/daemon`.
The [IPC transport specification](../../specs/unix-socket-ipc-transport/spec.md) defines Unix socket permissions, JSON-RPC framing, subscription cleanup, and the CLI client contract.
The [daemon host specification](../../specs/agent-daemon-host/spec.md) defines session loading, foreground execution, and graceful shutdown.

No proposed change alters those contracts.
The proposed [effect runtime migration specification](specs/effect-runtime-migration/spec.md) records package compatibility and behavior-preservation checks without changing graph or kernel semantics.

## Owner decisions still open

- Approve or reject a coordinated Effect 4 migration.
- Approve or change the proposed exact release set and pin policy.
- Confirm the migration stays one change across all current consumers.
- Confirm the package scope against the approved implementation base.

No implementation is authorized by this draft.

## Upstream sources

- [Effect 4.0.3 release and synchronized package versions](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.3), release commit `967a7dc`.
- [Effect 4.0.3 package metadata](https://github.com/Effect-TS/effect/blob/effect%404.0.3/packages/effect/package.json), including the public `./cli` export.
- [Effect v3 to v4 migration guide](https://github.com/Effect-TS/effect/blob/effect%404.0.3/MIGRATION.md).
- [Effect v3 to v4 API migration map](https://github.com/Effect-TS/effect/blob/effect%404.0.3/migration/v3-to-v4.md).
- The stable `effect@4.0.0` tag points to `67ba4e4`.
  The separate `2c552f2` commit is the release announcement commit, not the stable tag commit.
