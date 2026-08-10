# apps/daemon

The foreground host process that stands up the `@canopy/api-adapter` IPC server; it is the server (dockerd-style), not a client; it does not self-daemonize and owns no launch/supervision logic.

## Allowed dependencies

`@canopy/api-adapter`, `@canopy/graph`, `@canopy/storage`, `@canopy/storage-sqlite`.
External: `effect`, `@effect/cli`, `@effect/platform-node`, `@effect/platform`.

## Forbidden

- No fork, detach, PID file, or systemd/launchd unit -- launch and supervision of this process are out of scope.
- No React, no browser globals.
- Use Effect for I/O and error handling, not throw/try-catch.
- Do not add lifecycle/spawn logic to `apps/cli`; that package stays a pure client.
