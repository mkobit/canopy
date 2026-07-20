# WIT compilation and modularity

This directory contains the WebAssembly Interface Types (WIT) definitions that specify the boundary between the Canopy host and compiled guest plugins.
To avoid bloated components and "god objects," the interfaces are split into individual files organized by domain namespace.
Instead of a single monolithic target world, we declare multiple role-specific worlds (such as `wizard-plugin` and `view-renderer-plugin`).
This ensures guest modules only compile against and import the specific capabilities they require.
