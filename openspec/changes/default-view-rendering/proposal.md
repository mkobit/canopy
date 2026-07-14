## Why

Currently, Canopy's web application renders all nodes using a single hardcoded rendering switch.
It does not resolve nodes to their registered Renderer definitions or support default/custom layouts.
Wiring the Renderer and ViewDefinition nodes into actual node rendering allows the layout and display to be customized dynamically using the settings resolution cascade.

## What Changes

- **Renamed settings key**: Rename the SettingsSchema ID from `default-renderer` to `default-view`.
- **New EdgeTypes**: Add system EdgeTypes `uses_renderer` and `view_override` to the bootstrap process.
- **Seeded Renderers**: Seed default Renderer nodes for Text, Code, and Markdown during bootstrap.
- **Seeded ViewDefinitions**: Seed default ViewDefinition nodes for TextBlock, CodeBlock, and MarkdownNode.
- **Resolution Engine**: Implement a settings-cascade-based `resolveViewDefinition` function in `@canopy/settings`.
- **Component Registry**: Create a React component registry in `apps/web` mapping entry points to rendering components.
- **Dynamic Dispatch**: Update `BlockRenderer` to dispatch rendering dynamically using the registry.

## Capabilities

### New Capabilities

- `view-rendering`: Resolve and dispatch node rendering dynamically using system-defined renderers and view definitions.

### Modified Capabilities

<!-- None -->

## Impact

- `@canopy/graph`: Adds new system IDs, EdgeTypes, and bootstrap data.
- `@canopy/settings`: Implements `resolveViewDefinition` and handles the renamed settings key.
- `apps/web`: Introduces the React component registry and updates `BlockRenderer` to use resolved view definitions.
