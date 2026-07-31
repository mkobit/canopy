# Design: Graph WCAG 2.1 AA accessibility & ARIA live region announcements (`canopy-gtv.2.2`)

## Context

Bead `canopy-gtv.2.2`.
Following spatial keyboard navigation (`canopy-gtv.2.1`), graph components need WCAG 2.1 AA accessibility compliant ARIA roles, states, screen reader live region announcements, and high-contrast color badges.

## Goals & non-goals

### Goals

- Add semantic ARIA roles (`role="region"`, `role="button"`) and descriptive `aria-label` / `aria-selected` attributes to graph containers and node components (`CustomNode`, `NodeView`).
- Implement polite ARIA live region announcements (`aria-live="polite"`, `aria-atomic="true"`) for node selection changes and graph mutations (creation, connection).
- Ensure all text and badge elements meet WCAG 2.1 AA contrast ratios (minimum 4.5:1 for normal text).
- Provide unit tests verifying ARIA attributes, live announcements, and contrast compliance.

### Non-goals

- Graph rendering performance / viewport culling (tracked in `canopy-gtv.2.3`).
- Custom screen reader virtual cursor navigation inside SVG edge elements.

## Decisions

### Decision 1: Live Region Announcement Manager (`AriaLiveRegion`)

We implement a dedicated, accessible `AriaLiveRegion` component and `useAriaLiveAnnouncer` hook in `apps/web/src/components/graph/aria-live-region.tsx`.
The live region utilizes an HTML `div` with `aria-live="polite"`, `aria-atomic="true"`, and `className="sr-only"`.
Announcements are debounced / queued so rapid keyboard spatial navigation (holding arrow keys) does not spam or overwhelm screen readers.

### Decision 2: Node ARIA Semantics & Dynamic Labels

Nodes in `CustomNode` and `NodeView` render with:

- `role="button"`
- `aria-selected={selected}`
- Dynamic `aria-label`: `Node [Type]: [Name Property || ID]`
  This gives screen readers clear context when focused via `Tab` or directional arrows.

### Decision 3: High-Contrast Color Palette (WCAG 2.1 AA Compliance)

Update node component text colors:

- Node type badge: `bg-slate-100 text-slate-800 border border-slate-200 font-mono text-xs px-2 py-0.5 rounded font-medium` (Contrast ratio 7.1:1 on white).
- Node ID subtitle: `text-slate-600 font-mono text-[11px]` (Contrast ratio 4.6:1 on white, replacing `text-gray-400`/`text-gray-300`).
- Property labels: `text-slate-700 font-semibold text-xs uppercase tracking-wider` (Contrast ratio 7.1:1 on white).

## Technical implementation details

### Live Announcer Hook & Component API

```ts
export interface AriaLiveRegionProps {
  readonly message?: string;
}

export function AriaLiveRegion({ message }: AriaLiveRegionProps): React.ReactElement;

export function useAriaLiveAnnouncer(): {
  readonly announcement: string;
  readonly announce: (message: string) => void;
};
```

## Adversarial review and mitigations

### 1. Resource and performance overhead

- **Risk**: Rapid state changes (e.g. key-repeat on arrow navigation) trigger excessive re-renders and screen reader speech backlog.
- **Mitigation**: Screen reader messages are updated via a single atomic state string. Rapid navigation updates replace the active message rather than appending DOM nodes.

### 2. Failure modes and edge cases

- **Risk 1**: Empty or missing node property values cause `undefined` in `aria-label`.
- **Mitigation**: Fallback `aria-label` construct guarantees safe string interpolation: `Node ${node.type} (${node.id.slice(0, 6)})`.
- **Risk 2**: Screen reader fails to announce live region updates because element is rendered conditionally after mutation.
- **Mitigation**: `AriaLiveRegion` DOM node stays permanently mounted in the component hierarchy; only text content mutates.

### 3. Security and isolation

- **Risk**: Unsanitized user content injected into ARIA labels or live announcements could pollute screen reader speech or cause DOM layout issues.
- **Mitigation**: All property values and node titles are text-escaped React children without raw `dangerouslySetInnerHTML`.

### 4. Migration and backward compatibility risks

- **Risk**: Adding `role="button"` breaks default click or key press behavior on nested interactive elements.
- **Mitigation**: Keyboard handlers explicitly exclude nested `input` and `button` target elements (`event.target`).
