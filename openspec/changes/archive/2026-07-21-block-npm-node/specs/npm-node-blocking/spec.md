## ADDED Requirements

### Requirement: Block npm install

The system SHALL block any installation commands starting with `npm` by using a `preinstall` hook in [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json).

#### Scenario: blocker triggers on npm install

- **WHEN** the user executes `npm install`
- **THEN** the execution exits with status code 1 and prints a warning instructing the user to use `bun`.

### Requirement: Validate developer scripts and hooks

The static script scanner SHALL inspect all [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json) scripts and Husky hooks in the workspace.
It SHALL fail the check if any script or hook contains a command starting with `npm`, `npx`, or `node`.

#### Scenario: static validator fails on npm/node command

- **WHEN** the script scanner detects a command starting with `npm`, `npx`, or `node`
- **THEN** it SHALL exit with status code 1 and print a warning instructing the user to use `bun` or `bunx`.

#### Scenario: static validator passes on valid commands

- **WHEN** the script scanner runs and all commands use `bun` or other allowed tools
- **THEN** it SHALL exit with status code 0.
