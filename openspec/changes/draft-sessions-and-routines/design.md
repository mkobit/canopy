## Context

Bead `canopy-4mo`.
This document outlines the detailed technical design for projected and view nodes representing ephemeral or regenerated content.
It focuses on supporting "Routines" or entry wizards contributed by sandboxed WASM plugins.
These routines allow users to build draft nodes through a sequence of steps before committing them to the persistent event log.

## Goals / Non-Goals

**Goals:**
- Design a transaction-like boundary for staging uncommitted events.
- Allow standard view renderers and queries to run transparently on draft graph states.
- Establish a WebAssembly Interface Types (WIT) compatible handle-based API.
- Support plugin-contributed UI elements, command palette items, and multi-step entry forms.

**Non-Goals:**
- Building the WASM compilation/execution sandbox in this epic.
- Standardizing the layout system for plugins beyond basic HTML rendering and form inputs.

## Decisions

### Decision 1: Use Layered Overlay Graph (The "Draft Session" Model)
We choose to implement an overlay graph projection managed via draft sessions.
A draft session stages uncommitted events on top of a parent graph session, producing a combined projection.
To ensure compatibility with future sandboxed WASM extensions, all APIs are designed to be handle-based and stateless.

#### Alternatives Considered:
- **Projection-Level Virtual Providers**: Extends the core projection engine to dynamically inject virtual nodes. Rejected due to poor isolation for multi-step drafts.
- **Client-Side UI Form State**: Maintains the draft state entirely within React component state, bypassing the graph system. Rejected because it prevents reusing custom view renderers to preview draft nodes.

## Risks / Trade-offs

- **[Risk]** Memory bloat from caching draft graphs.
  - *Mitigation*: Reclaim and delete draft sessions on discard or successful commit.
- **[Risk]** Complexity of merging base graph changes into active draft sessions.
  - *Mitigation*: Draft sessions recalculate their overlay when parent session events are appended.
