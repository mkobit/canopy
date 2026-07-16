## Why

Currently, Canopy's event log requires every write operation to be immediately persisted and projected into the main graph.
There is no mechanism for users to construct complex, multi-step draft nodes (e.g., routines or multi-field wizards) in a safe, isolated, and renderable sandbox before committing them to the event log.
Sandboxed plugins also lack a clean API contract for registering UI contributions, triggering routines, and processing multi-step form inputs into draft graph events.

## What Changes

- **Draft Session**: Introduce a handle-based `DraftSession` that projects a merged overlay graph of persistent nodes and staged draft events.
- **WASM-Compatible Boundaries**: Define WIT-compliant interfaces for managing draft sessions, plugin UI registrations, and step-based wizard executions.
- **Stateless Wizard Execution**: Implement host-driven step rendering (HTML-based) and input callback bindings for plugins.

## Capabilities

### New Capabilities

- `draft-session`: Manage uncommitted event overlays on top of a parent graph session.
- `plugin-wizard-execution`: Register menu items/commands and execute step-by-step wizard forms that translate user input into draft graph events.

### Modified Capabilities

<!-- None -->

## Impact

- `@canopy/graph`: Adds `DraftSession` logic and incremental projection overlays.
- `@canopy/queries`: Exposes draft graph access.
- `apps/web`: Hosts the draft session lifecycle, handles plugin UI contributions, and renders dynamic step forms.
