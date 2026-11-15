# Web UI components

## Overview

This directory exports the application's stateless UI components and provides the top-level `Layout` shell that connects navigation, the new-node dialog, plugin wizard dialog, command palette, and child routes.

## Interface

- `[index.tsx:*]` Re-exports `PropertyDisplay`, `PropertyInput`, `NodeView`, `BlockEditor`, `TableLayout`, `ListLayout`, `CardsLayout`, `SideNavBar`, `TopAppBar`, `NewNodeDialog`, `WizardDialog`, `CommandPalette`, `InspectorPanel`, `GraphExplorerCanvas`, `InspectorNodeData`, `DocumentRenderer`, `QuickEntryOverlay`, `NamespaceCreateForm`, `NodeTypeCreateForm`, `EdgeTypeCreateForm`, and `PropertyTypeCreateForm`.
- `[layout.tsx:Layout]` Exported React component rendering `SideNavBar`, `NewNodeDialog`, `WizardDialog`, `CommandPalette`, and `react-router-dom` `Outlet` inside a dark container.
- Subdirectories:
  - [editor](./editor/README.md) — Uncontrolled `contentEditable` `BlockEditor` with formatting toolbar.
  - [explorer](./explorer/README.md) — `GraphExplorerCanvas` and `InspectorPanel`.
  - [graph](./graph/README.md) — ReactFlow `InteractiveGraphView`, custom node/edge renderers, `NodeView`, `QuickEntryOverlay`, and ARIA/spatial navigation.
  - [layout](./layout/README.md) — `TopAppBar`, `SideNavBar`, `CommandPalette`, `NewNodeDialog`, and `WizardDialog`.
  - [properties](./properties/README.md) — `PropertyDisplay` and `PropertyInput`.
  - [renderers](./README.md) — `BlockRenderer`, `DocumentRenderer`, registry, HTML sanitization, caching, and Tier-1/Tier-2 WASM dispatch.
  - [schema](./schema/README.md) — Schema creation forms and `PropertyListEditor`.
  - [views](./views/README.md) — `CardsLayout`, `ListLayout`, and `TableLayout`.

## Invariants

- `[layout.tsx:handleNewNode]` Requires a truthy `graph` from `useGraph()` before setting `isNewNodeOpen` to `true`; otherwise shows an alert and returns `undefined`.
- `[layout.tsx:handleSubmitNewNode]` Returns `undefined` without calling `createNode` when `graph` is falsy.
- `[layout.tsx:availableTypes]` Computes allowed node types via `listAllowedNodeTypes(graph, listNamespaces(graph))` only when `graph` is truthy, otherwise defaults to `[]`.
- `[layout.tsx:Layout]` Passes `graphId` to `SideNavBar` only when `graph !== null`.

## Side Effects

- `[layout.tsx:handleLogout]` Calls `showAlert('Logout clicked')`.
- `[layout.tsx:handleNewNode]` Calls `showAlert('Open a graph first.')` when `graph` is falsy, or updates `isNewNodeOpen` state to `true`.
- `[layout.tsx:handleSubmitNewNode]` Invokes `createNode(type, properties)` wrapped in `withResultAlert`, closes `NewNodeDialog`, and navigates to `/graph/${graph.id}/node/${value}` on success.
- `[layout.tsx:handleCancelNewNode]` Updates `isNewNodeOpen` state to `false`.

## Verification

- Run: `bun test`
