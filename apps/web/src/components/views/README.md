# View layout components

## Overview

This directory implements three stateless React view layout components (`CardsLayout`, `ListLayout`, and `TableLayout`) that render `readonly Node[]` collections and delegate node click events via `onNodeClick`.

## Interface

- `[cards-layout.tsx:CardsLayoutData]`, `[cards-layout.tsx:CardsLayoutEvents]`, `[cards-layout.tsx:CardsLayoutProperties]`, `[cards-layout.tsx:CardsLayout]` `React.FC<CardsLayoutProperties>` rendering nodes as cards.
- `[list-layout.tsx:ListLayoutData]`, `[list-layout.tsx:ListLayoutEvents]`, `[list-layout.tsx:ListLayoutProperties]`, `[list-layout.tsx:ListLayout]` `React.FC<ListLayoutProperties>` rendering nodes in optional grouped lists (`groupBy?: string`).
- `[table-layout.tsx:TableLayoutData]`, `[table-layout.tsx:TableLayoutEvents]`, `[table-layout.tsx:TableLayoutProperties]`, `[table-layout.tsx:TableLayout]` `React.FC<TableLayoutProperties>` rendering nodes in a table (`displayProperties?: readonly string[]`).

## Invariants

- All exported `*Data` and `*Events` prop fields are `readonly`.
- `[cards-layout.tsx:CardsLayout]`, `[list-layout.tsx:ListLayout]`, `[table-layout.tsx:TableLayout]` Render `'No nodes found.'` when `nodes.length === 0`.
- `[list-layout.tsx:groupNodes]` Groups by `node.shape ?? 'Open'` when `groupBy === 'type'`, otherwise by string value of `node.properties.get(groupBy)` or `'Ungrouped'`, and sorts group keys via `localeCompare` without mutating input.
- `[list-layout.tsx:NodeListItem]` Displays string property `'name'` or falls back to `` `${node.id.slice(0, 8)}…` ``.
- `[table-layout.tsx:TableLayout]` Defaults columns to `['name', 'description']` when `displayProperties` is `undefined` or empty, always renders a leading `'Type'` column, and renders `'—'` when `node.properties.get(col) === undefined`.

## Side Effects

- `[cards-layout.tsx:CardsLayout]`, `[list-layout.tsx:NodeListItem]`, `[table-layout.tsx:TableLayout]` Invoke caller-provided `onNodeClick(node)` on click; no internal state, storage, or network side effects.

## Verification

- Run: `bun test`
