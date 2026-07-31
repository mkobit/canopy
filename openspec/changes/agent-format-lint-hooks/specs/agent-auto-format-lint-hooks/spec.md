## ADDED Requirements

### Requirement: Automatic formatting and linting on agent file edits

The system SHALL automatically format supported edited files with Prettier and auto-fix JavaScript/TypeScript files with ESLint when triggered by agent post-tool-use hooks.

#### Scenario: Tool edit post-hook execution

- **WHEN** an agent edit or write tool modifies files in the repository
- **THEN** the system SHALL run `prettier --write` on supported edited files
- **AND** the system SHALL run `eslint --fix --cache` on modified TypeScript and JavaScript files.

#### Scenario: Graceful handling of syntax errors

- **WHEN** an edited file contains unparseable syntax or unfixable lint errors
- **THEN** the system SHALL log diagnostic messages to standard error
- **AND** the system SHALL exit cleanly without blocking agent execution.

### Requirement: Pre-approved permission whitelist rules

The system SHALL define permission whitelist rules in `.claude/settings.json`, `.claude/settings.local.json`, and `.gemini/settings.json` to allow auto-approval for safe workspace operations.

#### Scenario: Running workspace package scripts

- **WHEN** an agent executes standard workspace commands like `bun run ...`, `git ...`, or `bd ...`
- **THEN** the system SHALL match allowed permission rules to avoid manual user approval prompts.
