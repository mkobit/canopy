# Projected and view nodes for ephemeral/regenerated content

## Context

Bead `canopy-4mo`.
This document outlines the research and design for projected and view nodes representing ephemeral or regenerated content.
It focuses on supporting "Routines" or entry wizards contributed by sandboxed WASM plugins.
These routines allow users to build draft nodes through a sequence of steps before committing them to the persistent event log.

## Goals

- Design a transaction-like boundary for staging uncommitted events.
- Allow standard view renderers and queries to run transparently on draft graph states.
- Establish a WebAssembly Interface Types (WIT) compatible handle-based API.
- Support plugin-contributed UI elements, command palette items, and multi-step entry forms.

## Alternatives Considered

### Alternative 1: Projection-Level Virtual Providers
This approach extends the core projection engine to dynamically inject virtual nodes.
Virtual nodes use distinct ID prefixes and resolve to actual events only when edited.
While useful for global virtual nodes like daily notes, it is poorly suited for multi-step entry wizards that require isolated draft states.

### Alternative 2: Client-Side UI Form State
This approach maintains the draft state entirely within React component state, bypassing the graph system entirely.
While simple to implement, it prevents reusing custom view renderers to preview draft nodes before submission.
It also violates the "everything is a node" architectural invariant.

## Decision: Layered Overlay Graph (The "Draft Session" Model)

We choose to implement an overlay graph projection managed via draft sessions.
A draft session stages uncommitted events on top of a parent graph session, producing a combined projection.
To ensure compatibility with future sandboxed WASM extensions, all APIs are designed to be handle-based and stateless.

## Detailed Design

### 1. Draft Session Interface (WIT)

```wit
interface draft-session {
    type draft-session-id = string
    type graph-id = string

    create-draft: func(parent: graph-id) -> result<draft-session-id, error>

    get-graph: func(draft: draft-session-id) -> result<graph, error>

    apply-events: func(draft: draft-session-id, events: list<graph-event>) -> result<_, error>

    commit: func(draft: draft-session-id) -> result<_, error>

    discard: func(draft: draft-session-id) -> result<_, error>
}
```

### 2. Plugin Registration Interface (WIT)

```wit
record ui-contribution {
    label: string,
    action-id: string,
    hotkey: option<string>,
}

record plugin-manifest {
    name: string,
    version: string,
    description: option<string>,
    menu-items: list<ui-contribution>,
    commands: list<ui-contribution>,
}

interface plugin-lifecycle {
    get-manifest: func() -> plugin-manifest

    trigger-action: func(action-id: string) -> result<option<string>, error>
}
```

### 3. Wizard Step Execution Interface (WIT)

```wit
interface wizard-execution {
    render-step: func(
        step-id: string, 
        draft: draft-session-id
    ) -> result<string, error>

    handle-input: func(
        step-id: string,
        input-name: string,
        input-value: string
    ) -> result<list<graph-event>, error>

    get-next-step: func(
        step-id: string, 
        draft: draft-session-id
    ) -> result<option<string>, error>
}
```

## Wizard Execution Flow

1. The user triggers a plugin action via a menu or command palette shortcut.
2. The host application starts a new `DraftSession` based on the active graph.
3. The host requests the first step rendering from the plugin using the draft session handle.
4. When the user interacts with the form fields, the host captures input event payloads.
5. The host passes input events to the plugin, receives generated graph events, and stages them in the draft session.
6. The host re-renders the current step using the updated draft session projection.
7. Upon successful final submission, the host commits the staged events from the draft session into the primary event log.

## Verification Plan

### Core Unit Tests
- Test creating a draft session from a populated base graph.
- Test applying multiple sequential events to the draft session and asserting they are visible in the draft projection.
- Test that the parent graph remains unchanged until a commit is triggered.
- Test that committing a draft session successfully updates the parent session and persists the events.
- Test discarding a draft session.

### Integration Tests
- Build a mock in-memory plugin demonstrating a two-step wizard.
- Verify that step progression, input handling, and final transaction submission execute correctly.
