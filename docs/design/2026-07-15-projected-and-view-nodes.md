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

The detailed interface contract is specified in `apps/web/wit/plugin.wit`.
It comprises the following components:

### 1. Draft Session Interface (`canopy:graph/draft-session`)

The host implements the `draft-session` interface to expose graph query and staging capabilities to the plugin.
A `draft-session-handle` is passed to the plugin as a borrowed resource during execution.

```wit
interface draft-session {
  type node-id = string;
  type event-id = string;
  type type-id = string;

  record property-entry {
    name: string,
    value: property-value,
  }

  variant property-value {
    text(string),
    integer(s64),
    decimal(f64),
    boolean(bool),
    date-time(string),
    node-id(string),
    list-of-text(list<string>),
    none
  }

  record node-created-event {
    event-id: event-id,
    id: node-id,
    node-type: type-id,
    properties: list<property-entry>,
    timestamp: string,
    device-id: string,
    batch-id: option<string>,
  }

  record node-properties-updated-event {
    event-id: event-id,
    id: node-id,
    changes: list<property-entry>,
    timestamp: string,
    device-id: string,
    batch-id: option<string>,
  }

  variant draft-event {
    node-created(node-created-event),
    node-properties-updated(node-properties-updated-event)
  }

  record graph-node {
    id: node-id,
    node-type: type-id,
    properties: list<property-entry>,
  }

  enum draft-error {
    parent-not-found,
    unauthorized,
    invalid-event-format,
    validation-failure,
    concurrent-modification,
    storage-error
  }

  enum query-error {
    invalid-query,
    node-not-found,
    access-denied
  }

  resource draft-session-handle {
    apply-events: func(events: list<draft-event>) -> result<_, draft-error>;
    get-parent-revision: func() -> result<string, draft-error>;
    get-node: func(id: node-id) -> result<graph-node, query-error>;
    query-nodes: func(query-string: string) -> result<list<graph-node>, query-error>;
  }
}
```

### 2. Plugin Registration Interface (`canopy:graph/plugin-manifest`)

This interface defines the structure of the manifest file that each plugin registers.

```wit
interface plugin-manifest {
  record menu-item {
    label: string,
    command: string,
    shortcut: option<string>,
  }

  record command-contribution {
    id: string,
    title: string,
    category: option<string>
  }

  record plugin-manifest {
    name: string,
    version: string,
    description: option<string>,
    capabilities: list<string>,
    menu-items: list<menu-item>,
    commands: list<command-contribution>,
  }
}
```

### 3. Wizard Step Execution Interface (`canopy:graph/wizard-execution`)

Instead of a stateless execution interface, the wizard is modeled as a stateful resource lifecycle managed by the plugin.

```wit
interface wizard-execution {
  use draft-session.{draft-session-handle, draft-event, property-value};

  enum field-kind {
    text,
    number,
    boolean,
    date,
    node-reference
  }

  record field-definition {
    name: string,
    label: string,
    kind: field-kind,
    required: bool,
    default-value: option<property-value>,
    options: option<list<string>>
  }

  record form-schema {
    title: string,
    description: option<string>,
    fields: list<field-definition>,
    submit-label: string
  }

  record input-entry {
    field-name: string,
    value: property-value
  }

  variant step-destination {
    form(form-schema),
    complete,
    cancel
  }

  record step-result {
    next-step: step-destination,
    events-to-stage: list<draft-event>
  }

  resource wizard-session {
    constructor(draft: draft-session-handle);
    render-step-schema: func() -> result<form-schema, string>;
    handle-step-submission: func(inputs: list<input-entry>) -> result<step-result, string>;
  }
}
```

## Wizard Execution Flow

1. The user triggers a plugin action via a menu or command palette shortcut.
2. The host application starts a new `DraftSession` based on the active graph.
3. The host instantiates a new `wizard-session` resource, providing it with a handle to the draft session.
4. The host requests the form schema for the current step by calling `render-step-schema`.
5. The host renders the step's fields natively using safe, built-in input controls.
6. When the user completes the step and submits the form, the host packages the inputs and calls `handle-step-submission`.
7. The plugin processes the inputs, generates draft events, stages them via `apply-events` on the draft session handle, and returns the next step destination.
8. If the next destination is another form step, the flow repeats from step 4.
9. Upon completing the final step, the host checks if the parent graph revision has changed concurrently.
10. If no concurrent conflicts are detected, the host commits the staged events from the draft session to the persistent event log.

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

See the implementation verification details in `docs/design/2026-07-16-wasm-plugin-lifecycle-and-wizard.md`.
