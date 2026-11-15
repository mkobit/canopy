# Canopy daemon source

## Overview

This directory implements the foreground `canopy-daemon` CLI entrypoint, environment/flag configuration resolution, SQLite filesystem persistence adapter, IPC server host lifecycle, and custom Effect CLI output/diagnostic formatting.

## Interface

- `[cli-output.ts:withExecutableErrorReporting]`, `[cli-output.ts:runWithDaemonCliOutput]`, `[cli-output.ts:daemonCliFormatter]` Custom Effect CLI formatter, deferred help wrapper, and diagnostic reporter.
- `[config.ts:DaemonConfigError]`, `[config.ts:DaemonConfig]`, `[config.ts:DaemonConfigOverrides]`, `[config.ts:resolveDaemonConfig]` Configuration resolver returning `Result<DaemonConfig, DaemonConfigError>`.
- `[host.ts:DaemonHostError]`, `[host.ts:RunningHost]`, `[host.ts:startHost]` Boots `EventLogStore`, loads `GraphSession`, and starts `createIpcServer`, returning `Promise<Result<RunningHost, DaemonHostError>>`.
- `[index.ts:daemonCommand]`, `[index.ts:run]` Root `canopy-daemon` Effect CLI command with `--socket-path`, `--db-path`, and `--ephemeral` flags.
- `[sqlite-persistence.ts:createFileSystemSqlitePersistence]` `node:fs`-backed `SQLitePersistence` adapter for a given `databasePath`.

## Invariants

- `[cli-output.ts:runWithDaemonCliOutput]` Defers at most one formatted help write and flushes pending help before any other `Console.log` or on completion; on `ShowHelp` with errors, emits formatted errors and JSON diagnostics before failing.
- `[config.ts:resolveDaemonConfig]` Never throws; returns `err(DaemonConfigError)` if resolved `socketPath` or `databasePath` is not absolute; defaults `graphId` to `'canopy-default-graph'` and `ephemeral` to `true` only when explicitly enabled.
- `[host.ts:startHost]` Uses `createInMemoryEventStore()` when `config.ephemeral` is `true`, otherwise `createSQLiteEventLog` with `createFileSystemSqlitePersistence`; closes `eventLog` before returning `err` if `session.load()` or `server.listen()` fails; `RunningHost.close()` closes the IPC server before closing `eventLog`.
- `[index.ts:bootDaemon]` Manages `RunningHost` via `Effect.scoped` + `Effect.acquireRelease` and blocks in the foreground via `Effect.never`; interrupt-only exits return code `0`.
- `[sqlite-persistence.ts:createFileSystemSqlitePersistence]` `read()` maps `ENOENT` to `null` and re-rejects other errors; `write()` creates parent directories recursively with mode `0o700`.

## Side Effects

- `[cli-output.ts:runWithDaemonCliOutput]` Writes to `Console.log`, `Console.error`, and `Effect.logError`.
- `[config.ts:resolveDaemonConfig]` Reads `process.env` and `os.homedir()`, and generates a `DeviceId` via `createDeviceId()` when unset.
- `[host.ts:startHost]` Initializes on-disk SQLite event log (when non-ephemeral), loads the graph session, binds a Unix domain socket via `createIpcServer`, and logs `console.error` if `eventLog.close()` fails.
- `[index.ts:bootDaemon]` Logs the listening socket path via `Effect.logInfo` and runs `NodeRuntime.runMain` when executed as the entrypoint.
- `[sqlite-persistence.ts:createFileSystemSqlitePersistence]` Reads and writes `databasePath` and creates parent directories via `fs.promises`.

## Verification

- Run: `bun test`
