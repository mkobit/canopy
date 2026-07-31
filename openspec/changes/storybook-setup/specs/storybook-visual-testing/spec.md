## ADDED Requirements

### Requirement: Storybook setup in `apps/web`

The system SHALL support running Storybook in `apps/web` for isolated visual component rendering.

#### Scenario: Running storybook dev server
- **WHEN** `bun run storybook` is executed from the repository root or `apps/web`
- **THEN** Storybook SHALL start cleanly and serve component stories for preview.

### Requirement: Core Graph component stories

The system SHALL provide Component Story Format (CSF 3) stories for core Graph canvas and node components.

#### Scenario: Rendering core graph components in Storybook
- **WHEN** the user views stories for `CustomNode`, `CustomEdge`, and `GraphCanvas` in Storybook
- **THEN** the components SHALL render correctly with app styles (Tailwind CSS v4 and Google Fonts) and React Flow context.
