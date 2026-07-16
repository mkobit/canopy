## Context

Bead `canopy-4mo`.
This document outlines the final technical design for projected and view nodes representing ephemeral or regenerated content.
It focuses on supporting "Routines" or entry wizards contributed by sandboxed WASM plugins.
These routines allow users to build draft nodes through a sequence of steps before committing them to the persistent event log.

## Goals / Non-Goals

**Goals:**
- Design a transaction-like boundary for staging uncommitted events.
- Allow standard view renderers and queries to run transparently on draft graph states.
- Establish a WebAssembly Interface Types (WIT) compatible resource-based API.
- Support plugin-contributed UI elements, command palette items, and multi-step entry forms.
- Protect the host application from security exploits, performance lag, and memory leaks.

**Non-Goals:**
- Building the WASM compilation/execution sandbox in this epic.
- Standardizing the layout system for plugins beyond basic HTML rendering and form inputs.

## Decisions

### Decision 1: Use Layered Overlay Graph (The "Draft Session" Model)
We choose to implement an overlay graph projection managed via draft sessions.
A draft session stages uncommitted events on top of a parent graph session, producing a combined projection.
To ensure compatibility with future sandboxed WASM extensions, all APIs are designed using WebAssembly Component Model resources and explicit error types.

#### Alternatives Considered:
- **Projection-Level Virtual Providers**: Extends the core projection engine to dynamically inject virtual nodes. Rejected due to poor isolation for multi-step drafts.
- **Client-Side UI Form State**: Maintains the draft state entirely within React component state, bypassing the graph system. Rejected because it prevents reusing custom view renderers to preview draft nodes.

### Decision 2: Declarative UI Form Schemas instead of HTML
We choose to have plugins return declarative UI schema configurations instead of raw HTML strings for wizard steps.
This prevents sandbox escapes (XSS) and allows native rendering of safe fields (such as text, numbers, dates, and node references).

### Decision 3: Batch Input Submissions instead of Keystroke Callbacks
Form inputs are batched and submitted once per step rather than on every keystroke.
This limits guest-host boundary context switches and eliminates typing lag.

## Risks / Trade-offs

- **[Risk]** The Stale-State Commit Race (Split-Brain).
  - *Mitigation*: The host tracks the parent graph revision token and rejects the commit if the parent graph changed concurrently.
- **[Risk]** Memory leaks from dangling draft sessions.
  - *Mitigation*: Leverage WebAssembly Component Model resources to tie the session lifecycle to the guest lifecycle, auto-cleaning on drop.
- **[Risk]** Security sandbox escape via raw HTML rendering (XSS).
  - *Mitigation*: The plugin returns a declarative form schema, and the host renders the fields natively.
- **[Risk]** Performance lag from synchronous WASM roundtrips on every keystroke.
  - *Mitigation*: The host buffers keystrokes locally and sends inputs in a single batch on step submission.
- **[Risk]** High serialization overhead from transferring the entire graph.
  - *Mitigation*: The plugin queries individual nodes or runs queries on the host side using resource handles.
