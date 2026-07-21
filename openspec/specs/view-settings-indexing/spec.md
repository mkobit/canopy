# view-settings-indexing Specification

## Purpose
TBD - created by archiving change pre-index-view-settings. Update Purpose after archive.
## Requirements
### Requirement: O(1) settings schema lookup
The system SHALL retrieve a `SettingsSchema` node by its key property in O(1) time.

#### Scenario: retrieve schema by key
- **WHEN** resolving a setting value for a key
- **THEN** the system retrieves the matching schema node from a pre-computed index

### Requirement: O(1) user settings lookup
The system SHALL retrieve `UserSetting` property values by their schema ID, scope type, and scope target in O(1) time.

#### Scenario: retrieve user setting by scope
- **WHEN** cascading a setting value for a given scope level
- **THEN** the system retrieves the setting value from a pre-computed index mapping schema ID and scope to the setting value

### Requirement: O(1) view definition resolution
The system SHALL resolve a `ViewDefinition` node for a node using view overrides, settings cascade, and default views in O(1) time.

#### Scenario: resolve view definition
- **WHEN** resolving the view definition for a node
- **THEN** the system resolves the target `ViewDefinition` using pre-computed indexes for view override edges, settings cascade, and default view edges

