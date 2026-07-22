# Design: Modular WIT Architecture and Role-Specific Worlds

## Context

Bead `canopy-o20`.
This document describes the design for modularizing the WIT interface definitions and using capability-specific worlds.

## Modular WIT Layout

We split the monolithic `plugin.wit` file into individual files under `apps/web/wit/`:

- `wit/draft-session.wit`: Declares the `canopy:graph/draft-session` interface.
- `wit/plugin-manifest.wit`: Declares the `canopy:graph/plugin-manifest` interface.
- `wit/plugin-lifecycle.wit`: Declares the `canopy:graph/plugin-lifecycle` interface.
- `wit/wizard-execution.wit`: Declares the `canopy:graph/wizard-execution` interface.
- `wit/plugin-worlds.wit`: Declares distinct target worlds (e.g. `wizard-plugin`, `view-renderer-plugin`).

## Cross-Interface References

Interfaces refer to types defined in other files using explicit WIT `use` syntax.
For example, the wizard interface references types from the draft session interface:

```wit
interface wizard-execution {
  use draft-session.{draft-session-handle, draft-event, property-value};
  // ...
}
```

## Role-Specific Worlds

We define distinct target worlds for each plugin capability.
This ensures guest components compile against exactly the interface subset they require.

```wit
world wizard-plugin {
  import draft-session;
  export plugin-lifecycle;
  export wizard-execution;
}

world view-renderer-plugin {
  import graph-reader;
  export plugin-lifecycle;
  export node-renderer;
}
```

## Host Loading Flow

1. The host loads the plugin manifest and inspects its declared capabilities.
2. The host uses standard JavaScript reflection to check which interfaces the transpiled Guest exports.
3. The host registers the plugin with the appropriate host capabilities based on these exports.
