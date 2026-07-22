## Why

Currently, all WIT definitions reside in a single monolithic `apps/web/wit/plugin.wit` file.
This creates a "god object" where all plugin types are forced to compile against and implement imports and exports they do not use.
This increases compilation size, guest-side complexity, and host-side context overhead.

## What Changes

- **WIT Modularization**: Decompose the single `plugin.wit` file into separate interface-specific WIT files.
- **Multiple Worlds**: Define independent target worlds (such as `wizard-plugin` and `renderer-plugin`) for different component roles.
- **Capability-Based Registration**: Update the host loader to dynamically supply imports based on the plugin's declared manifest capabilities.

## Capabilities

### New Capabilities

- `modular-wit-interfaces`: Support loading multi-file WIT packages and role-specific worlds.

### Modified Capabilities

- `plugin-wizard-execution`: Clean up import wiring to use the new modularized worlds.

## Impact

- `apps/web`: Reorganizes the `wit/` directory, updates code generation tooling, and splits the host instantiation imports by world target.
