## 1. Modular WIT Layout and Codegen

- [x] 1.1 Decompose the monolithic `plugin.wit` file into separate interface-specific files.
- [x] 1.2 Update the WIT codegen tooling in `apps/web/scripts/wit-codegen.ts` to load the whole directory.
- [x] 1.3 Add modular interfaces for draft session, plugin manifest, plugin lifecycle, and wizard execution.

## 2. World Targets and Host Instantiation

- [x] 2.1 Define distinct worlds (`wizard-plugin`, etc.) in the modular WIT definitions.
- [x] 2.2 Refactor the host instantiation code to dynamically instantiate different worlds based on plugin capabilities.
- [x] 2.3 Verify compile, build, and integration tests using modular WIT structures.
