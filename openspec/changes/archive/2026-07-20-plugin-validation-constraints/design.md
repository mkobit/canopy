# Design: plugin validation constraints

## Context

Bead `canopy-0uf`.
This document details the validation rules and implementation design for WebAssembly plugin nodes in Canopy.
It introduces validation helpers for WASM binaries and manifests, and hooks them into the graph's validation pipeline.

## Goals & non-goals

### Goals

- Implement validation for the `wasm_binary` base64 string and its WebAssembly magic header.
- Implement validation for the JSON `manifest` structure, verifying all required fields.
- Integrate these validation checks into the core `validateNode` function in `@canopy/graph`.
- Ensure all functions return `Result` or `ValidationError[]` structures.

### Non-goals

- Compile or run the WebAssembly binary during validation.
- Query external repositories for plugin manifests.

## Decisions

### Decision 1: Create a dedicated validation file for plugins

We choose to define the plugin validators in a new file `packages/graph/src/plugin-validation.ts`.
This keeps the core validation file clean and preserves clear bounded contexts.

### Decision 2: Signature of validator helpers

We choose to return a list of `ValidationError` objects from the validation helpers.
This aligns directly with the internal validation design of `validateNode` in `validation.ts`.

### Decision 3: Manifest structural checks

The manifest validator will parse the JSON string and perform structural checks on name, version, and capabilities.
If the JSON parsing fails or the properties do not match the expected types, it will append appropriate validation errors.

## Technical implementation details

### Plugin validators module

The new module exports validation helpers.

```typescript
import type { ValidationError } from './validation-types';
import type { PropertyValue } from './properties';

export function validateWasmBinaryProperty(
  value: PropertyValue,
  propertyName: string,
): readonly ValidationError[];

export function validatePluginManifestProperty(
  value: PropertyValue,
  propertyName: string,
): readonly ValidationError[];
```

### Integration in validateNode

In `packages/graph/src/validation.ts`, the `validateNode` function will check if the node type is `SYSTEM_IDS.TYPE_PLUGIN`.
If it is, we will run the property validators for `wasm_binary` and `manifest`, merging any errors into the returned `ValidationResult`.
