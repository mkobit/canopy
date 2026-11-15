# Settings cascade & view resolution

## Overview

This directory implements a 5-level scoped settings cascade, `USER_SETTING` node creation, and 3-step `ViewDefinition` resolution on top of `@canopy/graph` indexes. It exposes pure graph query and node-construction functions re-exported through `index.ts`.

## Interface

- `[index.ts:*]` Re-exports all public symbols from `./cascade`, `./ops`, and `./view-resolution`.
- `[cascade.ts:ScopeType]` `'node' | 'type' | 'namespace' | 'global'`.
- `[cascade.ts:resolveSetting]` `(graph: Graph, settingKey: string, nodeId: NodeId, nodeType: TypeId, nodeNamespace: Namespace) => PropertyValue | undefined`.
- `[cascade.ts:findSettingsSchema]` `(graph: Graph, key: string) => Node | undefined`.
- `[ops.ts:AddUserSettingParameters]` `Readonly<{ schemaId: NodeId; value: unknown; scopeType: ScopeType; scopeTarget?: string }>`.
- `[ops.ts:addUserSetting]` `(graph: Graph, parameters: AddUserSettingParameters, options: NodeOperationOptions) => Result<GraphResult<Graph>, Error>`.
- `[view-resolution.ts:resolveViewDefinition]` `(graph: Graph, nodeId: NodeId, nodeType: TypeId, nodeNamespace: Namespace) => Result<Node, Error>`.

## Invariants

- `[cascade.ts:resolveSetting]` Evaluates scopes strictly in order `'node'` -> `'type'` -> `'namespace'` -> `'global'`, falling back to `JSON.parse` of `schema.properties.get('defaultValue')` (excluding `'null'`); `[cascade.ts:findUserSetting]` indexes `getGraphIndexes(graph).userSettings` by `` `${schemaNodeId}\0${scopeType}\0${scopeTarget}` ``.
- `[ops.ts:addUserSetting]` Constructs a `Readonly` `SYSTEM_IDS.USER_SETTING` node with JSON-serialized `'value'`, includes `'scopeTarget'` only when defined, and delegates to `addNode`.
- `[view-resolution.ts:resolveViewDefinition]` Resolves `ViewDefinition` strictly in order: (1) `indexes.viewOverrides.get(nodeId)`, (2) `resolveSetting(graph, 'default-view', ...)` when it references a `SYSTEM_IDS.VIEW_DEFINITION` node, (3) `indexes.defaultViews.get(nodeType)`.

## Side Effects

- None.

## Verification

- Run: `bun test`
