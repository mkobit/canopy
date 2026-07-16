# Projected and view nodes for ephemeral/regenerated content

## Context

Bead `canopy-4mo`.
This document outlines the final technical design for projected and view nodes representing ephemeral or regenerated content.
It focuses on supporting "Routines" or entry wizards contributed by sandboxed WASM plugins.
These routines allow users to build draft nodes through a sequence of steps before committing them to the persistent event log.

## Goals

- Design a transaction-like boundary for staging uncommitted events.
- Allow standard view renderers and queries to run transparently on draft graph states.
- Establish a WebAssembly Interface Types (WIT) compatible resource-based API.
- Support plugin-contributed UI elements, command palette items, and multi-step entry forms.
- Protect the host application from security exploits, performance lag, and memory leaks.

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
To ensure compatibility with future sandboxed WASM extensions, all APIs are designed using WebAssembly Component Model resources and explicit error types.

## Detailed Design

### 1. Draft Session Interface (WIT)

```wit
interface draft-session-types {
    type revision = string

    enum draft-error {
        parent-not-found,
        unauthorized,
        invalid-event-format,
        validation-failure(string),
        concurrent-modification,
        storage-error(string)
    }

    enum query-error {
        invalid-query,
        node-not-found,
        access-denied
    }
}

interface draft-session-manager {
    use draft-session-types.{revision, draft-error, query-error}

    /// Resource representing an active draft overlay session.
    resource draft-session {
        /// Creates a new draft session overlaying a parent graph.
        static create: func(parent: graph-id) -> result<draft-session, draft-error>

        /// Stages a batch of events onto the draft graph projection.
        apply-events: func(events: list<graph-event>) -> result<_, draft-error>

        /// Commits staged events if the parent revision matches.
        commit: func(expected-parent-revision: revision) -> result<_, draft-error>

        /// Discards the draft session.
        discard: func() -> result<_, draft-error>

        /// Gets the current revision of the parent graph.
        get-parent-revision: func() -> result<revision, draft-error>

        /// Fetches a single node from the combined projection.
        get-node: func(id: node-id) -> result<node, query-error>

        /// Executes a search on the combined projection.
        query-nodes: func(query-string: string) -> result<list<node>, query-error>
    }
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
    use draft-session-manager.{draft-session}

    record form-field {
        name: string,
        label: string,
        field-type: string, // e.g. "text", "number", "reference", "date"
        default-value: option<string>,
        required: bool,
    }

    record form-schema {
        title: string,
        description: option<string>,
        fields: list<form-field>,
    }

    /// Returns the schema defining the UI fields for the current step.
    /// Uses a borrowed draft session handle to access staged data.
    render-step-schema: func(
        step-id: string, 
        draft: borrow<draft-session>
    ) -> result<form-schema, wizard-error>

    /// Processes form input submitted by the user.
    /// Receives all field inputs as a key-value list to avoid keystroke lag.
    handle-step-submission: func(
        step-id: string,
        inputs: list<tuple<string, string>>,
        draft: borrow<draft-session>
    ) -> result<list<graph-event>, wizard-error>

    /// Determines the next step ID, or returns none if this is the final step.
    get-next-step: func(
        step-id: string, 
        draft: borrow<draft-session>
    ) -> result<option<string>, wizard-error>
}
```

## Wizard Execution Flow

1. The user triggers a plugin action via a menu or command palette shortcut.
2. The host application starts a new `draft-session` resource based on the active graph.
3. The host requests the form schema for the first step from the plugin using the draft session handle.
4. The host renders the step's fields natively using safe, built-in input controls.
5. When the user completes the step and clicks "Next", the host sends all form inputs to the plugin via `handle-step-submission`.
6. The plugin returns the resulting graph events, which the host applies to the draft session.
7. The host requests the next step ID from the plugin.
8. Upon completing the final step, the host verifies that the parent graph revision has not changed.
9. If no concurrency conflict exists, the host commits the staged events from the draft session to the persistent event log.

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

## Verification Plan

### Core Unit Tests
- Test creating a draft session from a populated base graph.
- Test applying multiple sequential events to the draft session and asserting they are visible in the draft projection.
- Test that the parent graph remains unchanged until a commit is triggered.
- Test that committing a draft session succeeds when the parent revision matches, and fails when it does not.
- Test discarding a draft session.

### Integration Tests
- Build a mock in-memory plugin demonstrating a two-step wizard.
- Verify that step progression, input handling, and final transaction submission execute correctly.
