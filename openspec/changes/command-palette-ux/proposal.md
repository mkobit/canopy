## Why

Currently, the command palette in Canopy has a single keyboard shortcut (`Ctrl+P` or `Ctrl+Shift+P`) which toggles a single view listing commands only.
This does not match standard editor conventions where `Ctrl+P`/`Cmd+P` acts as a quick file or node search, while `Ctrl+Shift+P`/`Cmd+Shift+P` acts as a command launcher.
Furthermore, the command palette cannot search or navigate to nodes in the graph, which limits its usefulness.
Additionally, the current implementation has several ESLint errors and lacks keyboard navigation conventions like selection cycling and prefix filtering.

## What Changes

- **Separate shortcuts and modes**: Split the keyboard shortcuts so that `Ctrl+Shift+P` (or `Cmd+Shift+P`) opens the command palette in Command Mode (with a `>` prefix in the input box), and `Ctrl+P` (or `Cmd+P`) opens it in Node Search Mode (with no prefix).
- **Node search and navigation**: Add node searching within the palette, displaying matched nodes with their name and type, and allowing navigation to the selected node via the router.
- **Mode switching by prefix**: Support dynamic mode switching based on the input prefix, where typing `>` at the beginning of the query switches to Command Mode, and removing the prefix switches back to Node Search Mode.
- **Refined UX and validation**: Ensure robust arrow key navigation, keyboard selection cycling, clear fallback states, and resolve ESLint errors in the components.

## Capabilities

### New Capabilities

- `command-palette-node-search`: Search and navigate to graph nodes directly from the command palette.
- `command-palette-prefix-modes`: Toggle and switch between Command Mode and Node Search Mode dynamically using prefixes (`>`) and dedicated keyboard shortcuts (`Ctrl+P` / `Ctrl+Shift+P`).

### Modified Capabilities

<!-- None -->

## Impact

- `apps/web`: Refactors `CommandPalette` to support multiple modes, keyboard shortcuts, prefix parsing, and node queries/navigation.
