# Web utilities

## Overview

This directory provides browser helper functions for CSS class merging, persistent device IDs, native dialogs, event handler wrappers, and graph schema and node-type queries. Only `device-id.ts`, `dialogs.ts`, and `handlers.ts` cause side effects (`localStorage`, browser dialog globals, and `console.error`).

## Interface

- `[cn.ts:cn]` `(...inputs: readonly ClassValue[]) => string` CSS class merger.
- `[device-id.ts:DEVICE_ID_STORAGE_KEY]`, `[device-id.ts:getOrCreateDeviceId]` Persistent browser `DeviceId` helper.
- `[dialogs.ts:showAlert]`, `[dialogs.ts:showPrompt]`, `[dialogs.ts:showConfirm]` Thin wrappers around global browser dialogs.
- `[handlers.ts:toHandler]`, `[handlers.ts:withResultAlert]` Event handler wrappers for React callbacks and `Result` error alerting.
- `[node-types.ts:NodeTypeOption]`, `[node-types.ts:readString]`, `[node-types.ts:parseProperties]`, `[node-types.ts:listAllowedNodeTypes]` Node-type option and instantiability helpers.
- `[schema.ts:NamespaceOption]`, `[schema.ts:TypeDefinitionOption]`, `[schema.ts:EdgeTypeOption]`, `[schema.ts:PropertyTypeOption]`, `[schema.ts:listNamespaces]`, `[schema.ts:listCreatableNamespaceKinds]`, `[schema.ts:listAllNodeTypes]`, `[schema.ts:listNodeTypesIn]`, `[schema.ts:listEdgeTypesIn]`, `[schema.ts:listPropertyTypesIn]`, `[schema.ts:listAllPropertyTypes]` Pure graph schema query helpers.

## Invariants

- `[device-id.ts:getOrCreateDeviceId]` Returns existing `localStorage` value wrapped with `asDeviceId(existing)`, or generates one via `createDeviceId()` when absent.
- `[node-types.ts:parseProperties]` Returns `[]` when `raw` is not a string, `JSON.parse` fails, or `PropertyDefinitionsSchema.safeParse` fails.
- `[node-types.ts:listAllowedNodeTypes]` Filters `graph.nodes` to `node.type === SYSTEM_IDS.NODE_TYPE` and `isInstantiable`: allows `LEGACY_ALLOWED_TYPE_DEF_IDS`, excludes `EXCLUDED_TYPE_DEF_IDS` (`USER_SETTING_DEF`), and otherwise requires a namespace kind not in `RESTRICTED_NAMESPACE_KINDS`.
- `[schema.ts:listNamespaces]`, `[schema.ts:listAllNodeTypes]`, `[schema.ts:listEdgeTypesIn]`, `[schema.ts:listAllPropertyTypes]` Drop malformed type nodes missing required string fields or valid `PropertyValueKindSchema` `valueKind`; `[schema.ts:listCreatableNamespaceKinds]` deduplicates kinds, excludes `RESTRICTED_NAMESPACE_KINDS`, and sorts with `localeCompare`.

## Side Effects

- `[device-id.ts:getOrCreateDeviceId]` Reads `localStorage.getItem(DEVICE_ID_STORAGE_KEY)` and writes `localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId)` when absent.
- `[dialogs.ts:showAlert]`, `[dialogs.ts:showPrompt]`, `[dialogs.ts:showConfirm]` Call global `alert`, `prompt`, and `confirm`.
- `[handlers.ts:withResultAlert]` On `!result.ok`, calls `console.error(errorMessage, result.error)` and `showAlert(...)`.

## Verification

- Run: `bun test`
