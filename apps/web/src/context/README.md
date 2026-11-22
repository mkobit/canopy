# Web React contexts

## Overview

This directory provides three React context providers (`StorageProvider`, `GraphProvider`, and `PluginProvider`) that initialize IndexedDB storage, manage active `GraphSession` state and graph mutations, and coordinate plugin discovery and wizard `DraftSession` lifecycles.

## Interface

- `[graph-context.tsx:GraphProvider]` and `[graph-context.tsx:useGraph]` Context provider and hook exposing `graph`, `isLoading`, `error`, `session`, `loadGraph`, `closeGraph`, `createNode`, `createEdge`, `updateNodeProperties`, `deleteNode`, `createNamespace`, `createNodeType`, `createEdgeType`, and `createPropertyType`.
- `[plugin-context.tsx:PluginProvider]` and `[plugin-context.tsx:usePlugin]` Context provider and hook exposing `loadedPlugins`, `menuItems`, `commands`, `activeWizard`, `startWizard`, `submitWizardStep`, and `cancelWizard`, alongside exported types `MenuItem`, `CommandContribution`, `PluginManifest`, `FieldKind`, `FieldDefinition`, `FormSchema`, and `ActiveWizardState`.
- `[storage-context.tsx:StorageProvider]` and `[storage-context.tsx:useStorage]` Context provider and hook exposing `eventLog`, `registry`, `deviceId`, `isLoading`, and `error`.

## Invariants

- `[graph-context.tsx:loadGraph]` Returns `err('Storage not available')` if `eventLog` from `useStorage()` is `null`; unsubscribes any prior `sessionReference` listener before creating a new `GraphSession`.
- `[graph-context.tsx:createNode]`, `[graph-context.tsx:createEdge]`, `[graph-context.tsx:updateNodeProperties]`, `[graph-context.tsx:deleteNode]`, `[graph-context.tsx:createNamespace]`, `[graph-context.tsx:createNodeType]`, `[graph-context.tsx:createEdgeType]`, `[graph-context.tsx:createPropertyType]` Return `err('No graph loaded')` if `sessionReference.current` is `null`; `createNode` and `createEdge` accept optional `type` (normalizing `''` to `undefined` for open entities) and validate inputs with `CreateNodeInputSchema` and `CreateEdgeInputSchema`; `commitCreatedNode` requires committed op events to contain a `NodeCreated` event.
- `[plugin-context.tsx:PluginProvider]` Scans `graph.nodes.values()` for `node.shape === SYSTEM_IDS.TYPE_PLUGIN` and parses the string `'manifest'` property as JSON.
- `[plugin-context.tsx:startWizard]` Requires non-null `parentSession`, matching `commandId` in `loadedPlugins`, entry in `STATIC_PLUGINS` (`'Mock Wizard Plugin'`), `'wizard'` in `manifest.capabilities`, and `pluginModule.wizardExecution` export.
- `[plugin-context.tsx:submitWizardStep]` Maps JS input values to WIT tags (`'text'`, `'integer'` via `BigInt`, `'decimal'`, `'boolean'`, `'list-of-text'`, `'none'`) and throws on any staged event tag other than `'node-created'` or `'node-properties-updated'`.
- `[storage-context.tsx:StorageProvider]` Initializes `deviceId` once via `getOrCreateDeviceId`; runs demo seeding only when `VITE_CANOPY_DEMO_SEED === 'true'` or `CANOPY_DEMO_SEED === 'true'`.

## Side Effects

- `[graph-context.tsx:GraphProvider]` Creates, loads, subscribes to, and unsubscribes from `GraphSession`, commits `NodeCreated`, `EdgeCreated`, `NodePropertiesUpdated`, `NodeRemoved`, and schema creation events, mutates refs/React state, and logs `console.error` on failure.
- `[plugin-context.tsx:PluginProvider]` Instantiates `DraftSession`, `DraftSessionHandle`, and plugin `WizardSession`, applies/commits/discards draft events, updates `loadedPlugins`/`activeWizard` state, and logs `console.error` on manifest parse or runtime failures.
- `[storage-context.tsx:StorageProvider]` Calls `getOrCreateDeviceId()`, initializes `IndexedDBEventLog` and `GraphRegistry` on mount, conditionally calls `seedVaultStore`, updates React state, and logs `console.error` on failure.

## Verification

- Run: `bun test`
