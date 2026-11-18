# Canopy CLI source

## Overview

This directory defines the root `canopy` Effect CLI entrypoint (`index.ts`) and custom help/error/diagnostic output formatting and console-interception wrappers (`cli-output.ts`).

## Interface

- `[cli-output.ts:withExecutableErrorReporting]` Wraps an `Effect` with `Effect.tapCause` to report non-interrupt, error-reported failures via `reportDiagnostic`.
- `[cli-output.ts:runWithCliOutput]` Runs a CLI `Effect` with a custom `CliOutput.Formatter` and `Console.Console` proxy that defers help output and reports `ShowHelp` errors.
- `[cli-output.ts:cliOutputLayer]` Constructs a `CliOutput.Formatter` rendering help text, option descriptions, command synopses, version, and error messages.
- `[index.ts:rootCommand]` Effect CLI root command `'canopy'` (`Command.make('canopy')`).
- `[index.ts:run]` `Command.run(rootCommand, { version: '0.1.0', renderErrors: false })`.

## Invariants

- `[cli-output.ts:runWithCliOutput]` Defers at most one help write in `Ref<DeferredHelp>`; when `ShowHelp` fails with `error.errors.length > 0`, deferred help is suppressed and errors/diagnostics are emitted instead.
- `[cli-output.ts:withExecutableErrorReporting]` Interrupt-only causes (`Cause.hasInterruptsOnly`) and causes where `!Runtime.getErrorReported(Cause.squash(cause))` are not reported.
- `[index.ts:run]` Built-in CLI error rendering is disabled (`renderErrors: false`) so `runWithCliOutput` and `withExecutableErrorReporting` control error output.
- `[index.ts:teardown]` Interrupt-only failures exit with status code `0` instead of delegating to `Runtime.defaultTeardown`.

## Side Effects

- `[cli-output.ts:runWithCliOutput]` Intercepts `Console.Console.log` via a `Proxy`, flushes buffered help text to `hostConsole.log`, writes formatted errors to `Console.error`, and emits diagnostics via `reportDiagnostic` (`Effect.logError`).
- `[index.ts:NodeRuntime.runMain]` Top-level check on `process.argv[1]` ending with `'index.ts'` or `'index.js'` executes `runWithOutput` via `NodeRuntime.runMain` with `NodeServices.layer`.

## Verification

- Run: `bun test`
