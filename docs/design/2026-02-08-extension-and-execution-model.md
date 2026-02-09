# Extension and execution model

> Status: **draft — conceptual, not implementation-ready**
> Scope: extension model, WASM execution, sandboxing, capability-based access, permission model
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md), [2026-02-08-query-engine.md](2026-02-08-query-engine.md)

---

## 1. Principles

Extensions are user-provided or third-party code that runs within the system.
They extend the system's capabilities: custom renderers, workflow actions, hooks, automations, data transformations.

Extensions run in a sandbox with limited, explicitly granted capabilities.
They cannot access anything beyond what they are permitted.

The system does not support user-provided extensions in the initial implementation.
This document establishes the conceptual model for future implementation.

---

## 2. Extensions are nodes

An extension is a node in the graph.
Its WASM binary is stored as a property (blob) or referenced by URI.
It has a system-defined Extension type (or a more specific subtype like Renderer, WorkflowAction, Hook, etc.).

Extensions are scoped to the vault they are installed in.
An extension in one vault has no effect on another vault.
If a user wants the same extension in multiple vaults, they install it in each one separately.

The installation problem (how extensions are discovered, distributed, and added to a vault) is deferred.
For now, the model assumes the WASM blob is present in the vault as a node.

---

## 3. Execution model

### WASM sandbox

Extensions execute as WASM modules in a sandboxed runtime.
Any language that compiles to WASM can be used to write an extension.

The sandbox provides:

- **Isolation**: the extension cannot access the host system (filesystem, network, etc.) directly.
- **Capability-based access**: the extension receives explicit handles to the APIs it is permitted to use.
- **Resource limits**: execution time, memory, and other resource constraints prevent runaway extensions.

The analogy is a container with limited capabilities.
The extension can only do what its capability handles allow.

### Capability handles

When an extension is invoked, it receives a set of capability handles scoped to its permissions.
These handles are the extension's interface to the system.

Possible capabilities (conceptual, not finalized):

- **Graph read**: query nodes and edges within permitted namespaces/types.
- **Graph write**: create or modify nodes and edges within permitted namespaces/types (produces events through the normal event system).
- **Render output**: return HTML or other rendered content to the view system.
- **Network access**: make outbound HTTP requests (if permitted).
- **Invoke other extensions**: call other extensions within the vault (if permitted).

An extension only receives the handles it has been granted.
A renderer extension might only get graph read and render output.
A workflow action might get graph read and graph write.

### Invocation

Extensions are invoked by the system, not by themselves.
The system decides when to invoke an extension based on:

- A renderer is needed for a node (invokes the renderer extension).
- A workflow step executes (invokes the workflow action extension).
- A hook fires on an event (invokes the hook extension).
- An automation triggers (invokes the automation extension).

The extension receives its input (node data, event data, etc.) and its capability handles, does its work, and returns its output.
It does not persist state outside of what it writes to the graph through its handles.

---

## 4. Permission model

### Uniform access control

Human users, AI agents, and extensions all go through the same API layer with policy-based authorization.
The permission model is the same for all consumers.

An extension's permissions are defined by a policy attached to its node in the graph.
The policy specifies which capabilities the extension receives when invoked.

### Policy definition

> **Open question**: the exact policy framework is TBD.
> Conceptual direction: declarative policies (similar to OPA or capability-based security models) that specify what an extension can read, write, and execute.
> Policies are likely stored as properties on the extension node or as related policy nodes.

### Least privilege

Extensions receive the minimum capabilities needed for their function.
A renderer does not need write access.
A workflow action does not need network access (unless it's an integration action).

The system should make it easy to define narrow policies and hard to grant broad access accidentally.

---

## 5. Extension types

These are the anticipated categories of extensions.
Each has a different invocation pattern and likely a different set of required capabilities.

### Custom renderers

Receive a node and its graph context.
Return rendered HTML.
Capabilities: graph read, render output.

### Workflow actions

Receive event or trigger data.
Perform graph operations or external actions.
Capabilities: graph read, graph write, possibly network access.

### Hooks

Triggered by events (node created, property updated, etc.).
Run synchronously or asynchronously after the event.
Capabilities: graph read, graph write.

### Automations

Scheduled or condition-triggered processes.
Run in the background.
Capabilities: graph read, graph write, possibly network access.

These categories are not exhaustive.
The extension model should be general enough to support new categories without redesigning the sandbox.

---

## 6. What the system provides without extensions

The initial system ships with system renderers, built-in query execution, and core workflow primitives.
All of these are application code, not extensions.

System capabilities that do not require extensions:

- Text, code, and markdown rendering (system renderers).
- Query execution (no-code visual, GQL, programmatic API).
- Settings management.
- Event processing and sync.
- Bootstrap and migration.

Extensions expand what the system can do beyond these built-in capabilities.

---

## 7. What this document does not cover

| Concern                              | Where it belongs         |
| ------------------------------------ | ------------------------ |
| WASM runtime implementation details  | Implementation phase     |
| Extension distribution and discovery | Future consideration     |
| Specific policy language syntax      | Future consideration     |
| Extension versioning and updates     | Future consideration     |
| Extension marketplace or registry    | Future consideration     |
| System renderer implementation       | View and renderer system |

---

## 8. Open questions

1. How extension WASM binaries are stored: as blob properties on the node, as external URI references, or both.
2. Policy framework: OPA-style, capability tokens, graph-stored rules, or something else.
3. Whether extensions can define their own settings schemas (likely yes, but mechanics TBD).
4. How extension updates are handled: new node version, node property update, or replacement node.
5. Whether extensions can invoke other extensions and how that permission chain works.
6. Resource limit defaults and whether they are configurable per extension.
7. Synchronous vs asynchronous invocation semantics for different extension types.
8. How extension errors surface to the user and whether they can affect system stability.
9. Whether extensions can register new node types or edge types in the graph.
