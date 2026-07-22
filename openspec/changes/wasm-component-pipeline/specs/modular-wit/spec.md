## ADDED Requirements

### Requirement: Configuration-driven multi-plugin compilation

The WIT build system SHALL support defining and compiling multiple target worlds and guest plugins based on a centralized configuration file.

#### Scenario: Compilation from configuration file

- **WHEN** the WIT codegen script is run with a configuration file specifying multiple plugins and worlds
- **THEN** it SHALL compile the types, componentize, and transpile all defined plugin targets automatically.
