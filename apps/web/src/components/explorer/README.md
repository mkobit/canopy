# Explorer components

## Overview

This directory provides two stateless React UI components for the graph explorer view: `GraphExplorerCanvas` for the canvas layout shell and `InspectorPanel` for displaying graph node/edge counts and selected node properties.

## Interface

- `[graph-explorer-canvas.tsx:GraphExplorerCanvasProperties]` Exported props interface for `GraphExplorerCanvas`.
- `[graph-explorer-canvas.tsx:GraphExplorerCanvas]` Exported React component rendering the explorer canvas layout shell.
- `[inspector-panel.tsx:InspectorNodeData]` Exported interface describing selected node metadata (`id`, `name`, `type`, `properties`).
- `[inspector-panel.tsx:InspectorPanelProperties]` Exported props interface for `InspectorPanel`.
- `[inspector-panel.tsx:InspectorPanel]` Exported React component displaying graph counts and selected node details.

## Invariants

- `[inspector-panel.tsx:InspectorNodeData]` All fields on `InspectorNodeData` are `readonly`.
- `[inspector-panel.tsx:InspectorPanelProperties]` All fields on `InspectorPanelProperties` are `readonly`.
- `[inspector-panel.tsx:InspectorPanel]` Props are typed as `Readonly<InspectorPanelProperties>`; falls back to `0` for `graph?.nodes.size` and `graph?.edges.size`, `'No selection'` for `selectedNode?.name`, `'Unknown'` for `selectedNode?.type`, and `{}` for `selectedNode.properties`.

## Side Effects

- None.

## Verification

- Run: `bun test`
