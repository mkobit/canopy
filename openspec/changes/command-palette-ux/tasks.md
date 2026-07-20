## 1. Command Palette Shortcuts and Modes

- [x] 1.1 Listen for `Ctrl+P`/`Cmd+P` and `Ctrl+Shift+P`/`Cmd+Shift+P` shortcuts to toggle the palette in Node Search and Command modes.
- [x] 1.2 Implement input parsing to switch between Command and Node Search modes dynamically when typing or deleting the `>` prefix.
- [x] 1.3 Add node search capability using `executeStoredQuery` with `SYSTEM_IDS.QUERY_ALL_NODES` and filter by node ID and name property.
- [x] 1.4 Navigate to the selected node route `/graph/${graphId}/node/${nodeId}` using `useNavigate` when a node item is selected.
- [x] 1.5 Polish keyboard navigation to support index cycling and clean focus management.
- [x] 1.6 Fix ESLint warnings and errors in `command-palette.tsx` and related wizard or dialog components.
- [x] 1.7 Write test cases in `command-palette.test.tsx` to verify shortcuts, prefix mode switching, node search, and navigation.
