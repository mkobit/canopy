# plugin-wizard-execution Specification

## Purpose

TBD - created by archiving change draft-sessions-and-routines. Update Purpose after archive.

## Requirements

### Requirement: Plugin UI contribution

The system SHALL scan and load plugin manifests to register menu items and command palette items.

#### Scenario: Registering menu items

- **WHEN** the host application loads a plugin node containing a manifest
- **THEN** the host SHALL add the registered menu items to the application menu

### Requirement: Declarative step rendering

The system SHALL delegate rendering of wizard steps to the active plugin by calling `render-step-schema` to get a declarative UI form schema.

#### Scenario: Displaying step form fields natively

- **WHEN** the host displays a wizard step
- **THEN** the host SHALL call `render-step-schema` and natively render the returned form fields

### Requirement: Form step batch input submission

The system SHALL buffer form field input locally on the host and submit them as a single batch to the active plugin upon step submission.

#### Scenario: Submitting batched step fields

- **WHEN** the user completes a form step and clicks next
- **THEN** the host SHALL invoke `handle-step-submission` on the plugin and stage the returned events in the draft session
