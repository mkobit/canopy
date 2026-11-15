# Canopy CLI source

## Overview

This directory defines the root `canopy` Effect CLI entrypoint (`index.ts`), shared `--socket-path` and `--json` flags (`options.ts`), and custom help/error/diagnostic output formatting and console-interception wrappers (`cli-output.ts`), rolling up the subcommand groups under `./commands`.

## Interface

- `[cli-output.ts:withExecutableErrorReporting]` Wraps an `Effect` with `Effect.tapCause` to report non-interrupt, error-reported failures via `reportDiagnostic`.
- `[cli-output.ts:runWithCliOutput]` Runs a CLI `Effect` with a custom `CliOutput.Formatter` and `Console.Console` proxy that defers help output and reports `ShowHelp` errors.
- `[cli-output.ts:cliOutputLayer]` Constructs a `CliOutput.Formatter` rendering help text, option descriptions, command synopses, version, and error messages.
- `[index.ts:rootCommand]` Effect CLI root command `'canopy'` registering subcommands `status`, `node`, `edge`, `types`, `query`, and `events`.
- `[index.ts:run]` `Command.run(rootCommand, { version: '0.1.0', renderErrors: false })`.
- `[options.ts:socketPathOption]` Effect CLI `Flag.String('socket-path')` for the Canopy IPC Unix domain socket path.
- `[options.ts:jsonOption]` Effect CLI `Flag.Boolean('json')` defaulting to `false` for JSON response output.
- Subdirectory: [commands](./commands/README.md) — Effect CLI command groups (`edge`, `events`, `node`, `query`, `status`, `types`).

## Invariants

- `[cli-output.ts:runWithCliOutput]` Defers at most one help write in `Ref<DeferredHelp>`; when `ShowHelp` fails with `error.errors.length > 0`, deferred help is suppressed and errors/diagnostics are emitted instead.
- `[cli-output.ts:withExecutableErrorReporting]` Interrupt-only causes (`Cause.hasInterruptsOnly`) and causes where `!Runtime.getErrorReported(Cause.squash(cause))` are not reported.
- `[index.ts:run]` Built-in CLI error rendering is disabled (`renderErrors: false`) so `runWithCliOutput` and `withExecutableErrorReporting` control error output.
- `[index.ts:teardown]` Interrupt-only failures exit with status code `0` instead of delegating to `Runtime.defaultTeardown`.
- `[options.ts:socketPathOption]` Defaults to `process.env.CANOPY_SOCKET_PATH` or `path.join(process.cwd(), 'tmp', 'canopy.sock')`; `[options.ts:jsonOption]` defaults to `false`.

## Side Effects

- `[cli-output.ts:runWithCliOutput]` Intercepts `Console.Console.log` via a `Proxy`, flushes buffered help text to `hostConsole.log`, writes formatted errors to `Console.error`, and emits diagnostics via `reportDiagnostic` (`Effect.logError`).
- `[index.ts:NodeRuntime.runMain]` Top-level check on `process.argv[1]` ending with `'index.ts'` or `'index.js'` executes `runWithOutput` via `NodeRuntime.runMain` with `NodeServices.layer`.
- `[options.ts:socketPathOption]` Reads `process.env.CANOPY_SOCKET_PATH` and calls `process.cwd()` at module load time.

## Verification

- Run: `bun test`
