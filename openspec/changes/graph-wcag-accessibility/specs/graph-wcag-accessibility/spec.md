# Capability: `graph-wcag-accessibility`

## ADDED Requirements

### Requirement: WCAG 2.1 AA accessibility roles and live region announcements

Graph containers and node components MUST include semantic ARIA attributes (`role="region"`, `role="button"`, `aria-selected`, dynamic `aria-label`) and announce graph mutations and selection events via polite ARIA live regions.

#### Scenario: Screen reader announces node selection and region roles

- **GIVEN** a graph visualization rendering nodes
- **WHEN** a user focuses or selects a node
- **THEN** the node exposes `role="button"`, `aria-selected="true"`, dynamic `aria-label`, and the live region announces the selection event politely.
