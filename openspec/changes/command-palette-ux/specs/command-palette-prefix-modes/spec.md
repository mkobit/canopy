## ADDED Requirements

### Requirement: Separate shortcuts for palette modes

The system SHALL support opening the command palette in Node Search Mode with `Ctrl+P`/`Cmd+P` and in Command Mode with `Ctrl+Shift+P`/`Cmd+Shift+P`.

#### Scenario: Opening with shortcuts

- **WHEN** the user presses the Node Search shortcut
- **THEN** the system SHALL open the palette in Node Search Mode with an empty query.
- **WHEN** the user presses the Command Mode shortcut
- **THEN** the system SHALL open the palette in Command Mode with a `>` character pre-populated in the input.

### Requirement: Prefix-based mode switching

The system SHALL dynamically switch between Command Mode and Node Search Mode based on whether the input query begins with the `>` prefix.

#### Scenario: Typing mode prefix

- **WHEN** the user types `>` as the first character in the input box
- **THEN** the system SHALL switch the palette to Command Mode.
- **WHEN** the user deletes the leading `>` prefix from the input box
- **THEN** the system SHALL switch the palette to Node Search Mode.
