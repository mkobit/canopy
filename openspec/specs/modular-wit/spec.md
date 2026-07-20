# modular-wit Specification

## Purpose
TBD - created by archiving change modular-wit-architecture. Update Purpose after archive.
## Requirements
### Requirement: Modular WIT directory compilation

The host build system SHALL support compiling multiple WIT interface files from a modular directory structure.

#### Scenario: Compiling modular WIT files

- **WHEN** the host runs the WIT codegen script
- **THEN** it SHALL resolve type references across files using the package namespace references and produce valid bindings

### Requirement: Role-specific world targets

The system SHALL support compiling guest plugins against distinct target worlds depending on their role.

#### Scenario: Instantiating a specific world type

- **WHEN** the host loads a guest plugin targeting a specific world
- **THEN** it SHALL only require imports defined for that specific world and register the exported capability handlers

