# Mock wizard guest plugin

## Overview

This directory implements a two-step mock wizard guest plugin conforming to the `canopy:graph/plugin` and `canopy:graph/wizard-execution` WIT interfaces. It exports lifecycle handlers and a `WizardSession` class that collects `name` and `age` inputs before staging a single `node-created` event.

## Interface

- `[guest.ts:pluginLifecycle]` Exported `const` implementing `typeof PluginLifecycleInterface` with `getManifest()`, `initialize()`, and `shutdown()`.
- `[guest.ts:WizardSession]` Exported class implementing `WizardSessionClass` with `constructor(draft: DraftSessionHandle)`, `renderStepSchema(): FormSchema`, and `handleStepSubmission(inputs: readonly InputEntry[]): StepResult`.
- `[guest.ts:wizardExecution]` Exported `const` implementing `typeof WizardExecutionInterface` exposing `{ WizardSession }`.

## Invariants

- `[guest.ts:WizardSession.constructor]` Initializes `private step` to `0` and retains `private readonly draft: DraftSessionHandle` (unused in methods).
- `[guest.ts:WizardSession.renderStepSchema]` Returns Step 1 (`'name'`, kind `'text'`, required `true`) when `this.step === 0`, otherwise Step 2 (`'age'`, kind `'number'`, required `true`).
- `[guest.ts:WizardSession.handleStepSubmission]` Transitions `this.step` from `0` to `1` on first submission with empty `eventsToStage`, and completes on subsequent submission with one `'node-created'` event (defaulting `age` to `0n` if no `'integer'` input named `'age'` is present).
- `[guest.ts:pluginLifecycle]` `initialize()` and `shutdown()` always return `{ tag: 'ok', val: undefined }`.

## Side Effects

- `[guest.ts:WizardSession.handleStepSubmission]` Mutates internal instance state `this.step = 1` when `this.step === 0` and reads system wall-clock time via `new Date().toISOString()` for the staged event's timestamp.

## Verification

- Run: `bun test`
