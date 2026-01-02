# @canopy/ui

This package provides React components for the Canopy user interface.
It serves as the visual building block library for applications.

## Code Navigation

Components are located in `src/components/`, organized by domain (graph, properties, editor).
Styles are handled via `className` props using Tailwind CSS utility classes.
`src/utils/` contains helper functions like `cn` for class merging.

## Architectural Invariants

Components must be stateless and receive data via props.
No data fetching or mutation should occur within components.
Components should be composable and focused on a single responsibility.
Styling should be customizable via `className` props.

## Component Patterns

### Property Display

`PropertyDisplay` renders values based on their `kind`.
It handles all scalar types (text, number, boolean, date, reference).

### Property Input

`PropertyInput` provides editing controls for property values.
It emits `onChange` events with the new value, preserving the original kind.

### Graph Visualization

`GraphCanvas` is the main container for rendering nodes and edges.
`NodeView` renders a single node card with its properties.
`EdgeView` renders connections between nodes.
Nodes require a `position` in the `GraphNode` interface, which extends the base `Node`.

### Content Editing

`BlockEditor` provides a rich text editing experience for content.
It currently supports basic formatting like bold, italic, and links.

## Dependencies

`@canopy/types` for prop types.
`react` and `react-dom` for rendering.
`clsx` and `tailwind-merge` for class name management.

## Testing Approach

Components are tested for rendering correctness and event handling.
Tests use `vitest` and `@testing-library/react`.
Run tests using `pnpm test`.
