## ADDED Requirements

### Requirement: Plugin UI contribution
The system SHALL scan and load plugin manifests to register menu items and command palette items.

#### Scenario: Registering menu items
- **WHEN** the host application loads a plugin node containing a manifest
- **THEN** the host SHALL add the registered menu items to the application menu

### Requirement: Step rendering
The system SHALL delegate rendering of wizard steps to the active plugin by calling `render-step` with a draft session handle.

#### Scenario: Displaying step form HTML
- **WHEN** the host displays a wizard step
- **THEN** the host SHALL call `render-step` and display the returned HTML form

### Requirement: Form input processing
The system SHALL pass form input events to the active plugin and apply the resulting graph events to the draft session.

#### Scenario: Submitting field value
- **WHEN** the user edits a form field
- **THEN** the host SHALL invoke `handle-input` on the plugin and stage the returned events in the draft session
