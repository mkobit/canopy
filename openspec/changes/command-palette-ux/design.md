# Design: Command palette UX alignment

## Context

Bead `canopy-yog`.
This document details the design for aligning the command palette shortcut and modes with editor conventions.
It introduces a split mode behavior: Command Mode for launching plugin tasks, and Node Search Mode for finding and navigating to graph nodes.

## Goals & Non-Goals

### Goals

- Support two distinct palette modes: Node Search Mode and Command Mode.
- Assign dedicated editor-standard shortcuts: `Ctrl+P`/`Cmd+P` for Node Search Mode, and `Ctrl+Shift+P`/`Cmd+Shift+P` for Command Mode.
- Support prefix-based mode switching (typing `>` switches to Command Mode, and deleting it switches to Node Search Mode).
- Query and filter graph nodes by ID and name properties using standard queries when in Node Search Mode.
- Navigate to the selected node via the router on confirmation.
- Refine keyboard interaction to support cycling selection and scroll alignment.
- Eliminate existing ESLint errors in the related files.

### Non-Goals

- Global full-text search across node contents or block hierarchies in this task.
- Persisting search history or recently visited nodes in storage.

## Decisions

### Decision 1: Prefix-based mode routing

We choose to route the palette mode dynamically based on the input text.
If the input text starts with `>` (with or without leading whitespace), the palette enters Command Mode.
If the input does not start with `>`, the palette enters Node Search Mode.
This matches the convention used in VS Code and Obsidian.

### Decision 2: Context-aware node querying

We use `executeStoredQuery(graph, SYSTEM_IDS.QUERY_ALL_NODES)` to fetch the active graph nodes.
We perform clientside filtering on `node.id` and the `name` property.
If no graph is currently loaded, the Node Search Mode displays a helpful message indicating that a graph must be open.

### Decision 3: Standard browser routing for navigation

We leverage `useNavigate` and the `graphId` route parameter from `react-router-dom`.
When a node is selected, the palette closes, and we navigate the router to `/graph/${graphId}/node/${nodeId}`.

## User Interface Design

### Shortcuts

- `Ctrl+P` or `Cmd+P` opens the palette with an empty input and sets the focus to the input box in Node Search Mode.
- `Ctrl+Shift+P` or `Cmd+Shift+P` opens the palette with `>` already populated in the input box and sets the focus to the input box in Command Mode.
- Pressing `Escape` or clicking outside the container closes the palette.

### Input Box and Layout

- The input box displays a placeholder text based on the active mode (e.g., "Search nodes..." or "Type a command to run...").
- A mode indicator icon or text label is shown to clarify the active mode.
- Results are displayed in a clean, scrollable dropdown list.

### List Filtering

- Command Mode matches against the lowercase `title` and `category` of registered plugin commands.
- Node Search Mode matches against the lowercase `id` and `name` property value of graph nodes.
- A maximum of 10 results are rendered in the list to preserve UI performance.

### Keyboard Navigation

- `ArrowDown` and `ArrowUp` move the active selection index through the list.
- Selection wraps around (cycles) when navigating past the boundaries of the list.
- `Enter` triggers the action for the currently selected item (starting a wizard or navigating to a node).

## Technical Implementation Details

### Component Signature

The `CommandPalette` component remains parameterless and mounts globally within the main layout.
It accesses graph and plugin contexts via hooks.

```typescript
export const CommandPalette: React.FC = () => {
  // Logic here
}
```

### State Management

The component manages:
- `isOpen`: boolean state for visibility.
- `query`: string state for the text input.
- `selectedIndex`: number state for keyboard selection.
