# Extension and execution model

> Status: **draft — conceptual, not implementation-ready**
> Scope: extension model, WASM execution, sandboxing, capability-based access, permission model
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md), [2026-02-08-query-engine.md](2026-02-08-query-engine.md), [2026-02-08-view-and-renderer-system.md](2026-02-08-view-and-renderer-system.md), [2026-02-08-workflow-system.md](2026-02-08-workflow-system.md)

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

Extensions execute as WebAssembly modules in a sandboxed runtime.
Any programming language compiling to WASM can be used to write extensions.
The sandbox ensures isolation so that extensions cannot access the host system filesystem, network, or other processes directly.
Capability-based security is enforced by providing explicit capability handles during module instantiation.
Resource limits such as execution time, maximum memory, and call stack depth are configured by the host to prevent runaway code.

### Loading and unloading lifecycle

The host manages compiling, instantiating, and caching WASM modules dynamically.
When a plugin node is loaded, the host compiles its WASM binary and caches the compiled module in memory.
Guest instances themselves are stateless and instantiated on-demand for specific calls (e.g. rendering a single node or processing a single trigger).
Once the invocation finishes, the host tears down the instance and reclaims its memory.
This stateless execution pattern ensures that plugins can be loaded and unloaded without leaking resources or leaving stale memory.

### WebAssembly Interface Types (WIT) and host capabilities

All APIs between the host and the plugins are defined using WebAssembly Interface Types (WIT).
The host imports standard interfaces that extensions can consume:
- `canopy:graph/read`: Lookup nodes and query edge relationships in the graph.
- `canopy:graph/write`: Append new events to the event log.
- `canopy:system/events`: Subscribe and publish to transient in-memory events.
- `canopy:ui/render`: Return HTML output to the viewport.

Extensions export specific interface functions based on their type, such as `render(node)` or `execute(trigger)`.

### Inter-plugin communication

Plugins communicate using two primary patterns depending on whether the call is synchronous or asynchronous.
For synchronous utility dependencies (e.g., calling a markdown parser or syntax highlighter), plugins use WASM Component Model dynamic binding.
The host resolves these dependencies at load time, linking the guest import of Plugin A directly to the guest export of Plugin B.
This linking allows direct WASM-to-WASM calls without host intervention or serialization overhead.
For asynchronous, decoupled communication (e.g., reacting to calendar ticks or document updates), plugins publish and subscribe to transient events using the host-provided event bus interface.
This event bus is in-memory and does not write to the persistent graph, keeping transient notifications fast and lightweight.

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

| Concern                              | Where it belongs                                                   |
| ------------------------------------ | ------------------------------------------------------------------ |
| WASM runtime implementation details  | Implementation phase                                               |
| Extension distribution and discovery | Future consideration                                               |
| Specific policy language syntax      | Future consideration                                               |
| Extension versioning and updates     | Future consideration                                               |
| Extension marketplace or registry    | Future consideration                                               |
| System renderer implementation       | [View and renderer system](2026-02-08-view-and-renderer-system.md) |

---

## 8. Open questions

1. How extension WASM binaries are stored: they are stored as blob properties on the node for self-contained synchronization, but the host supports external URI references (like `file://` or `http://`) to facilitate local plugin development.
2. Policy framework: OPA-style, capability tokens, graph-stored rules, or something else.
3. Whether extensions can define their own settings schemas (likely yes, but mechanics TBD).
4. How extension updates are handled: new node version, node property update, or replacement node.
5. Whether extensions can invoke other extensions and how that permission chain works: resolved at load time using WASM Component Model dynamic binding for synchronous imports, and via the host-brokered pub/sub Event Bus for asynchronous event dispatch.
6. Resource limit defaults and whether they are configurable per extension.
7. Synchronous vs asynchronous invocation semantics for different extension types.
8. How extension errors surface to the user and whether they can affect system stability.
9. Whether extensions can register new node types or edge types in the graph.
