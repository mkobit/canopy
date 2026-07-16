# WASM Component Model Plugin Hosting Lifecycle and Wizard UI Design

## Context & Motivation

Canopy requires an extensible, sandboxed system to allow user-defined plugins to contribute custom multi-step input wizards.
These wizards guide users through complex data entry tasks.
They generate graph events that are staged in a draft session before being committed to the persistent log.
This design defines the lifecycle of WebAssembly plugins, their representation in the graph, and how the host executes their UI flows.

## Core Design Principles

### Functional Programming Style

All operations on graph states and event logs must be pure.
Functions must return new states rather than mutating existing data structures in place.
Errors are represented as explicit values rather than thrown exceptions.

### Immutable Types

All data structures representing plugins, manifests, events, and forms are deeply read-only.
TypeScript interfaces use the `readonly` modifier on all fields.

### Branded Identifiers

Identifiers and raw strings are branded to prevent type confusion and ensure domain safety.
For example, base64-encoded WebAssembly binaries and JSON manifest strings are assigned specific branded types.

## Plugin Node Representation

Plugins are represented as nodes in the graph using a dedicated schema.
This section details the TypeScript types for the plugin node and its properties.

```typescript
declare const wasmBinaryBase64Brand: unique symbol;
export type WasmBinaryBase64 = string & Readonly<{ [wasmBinaryBase64Brand]: never }>;

declare const pluginManifestJsonBrand: unique symbol;
export type PluginManifestJson = string & Readonly<{ [pluginManifestJsonBrand]: never }>;

declare const pluginVersionBrand: unique symbol;
export type PluginVersion = string & Readonly<{ [pluginVersionBrand]: never }>;

export type PluginNode = Readonly<{
  id: NodeId;
  type: 'plugin';
  properties: ReadonlyMap<string, PropertyValue>;
  metadata: TemporalMetadata;
}>;
```

### Type Validation

The host must validate that the node properties conform to their branded types.
The version property can be any string.
The `wasm_binary` property must be a base64-encoded string representing a valid WebAssembly module.
The `manifest` property must be a valid JSON string conforming to the manifest schema.

```typescript
import { ok, err, Result } from './result';

export function validateWasmBinaryBase64(value: string): Result<WasmBinaryBase64, string> {
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(value)) {
    return err('Invalid Base64 characters.');
  }
  try {
    const raw = atob(value.slice(0, 32));
    const isWasmMagic =
      raw.charCodeAt(0) === 0x00 &&
      raw.charCodeAt(1) === 0x61 &&
      raw.charCodeAt(2) === 0x73 &&
      raw.charCodeAt(3) === 0x6d;
    if (!isWasmMagic) {
      return err('Missing WebAssembly magic binary header.');
    }
    return ok(value as WasmBinaryBase64);
  } catch {
    return err('Failed to decode Base64 data.');
  }
}
```

### JSON Schema for Manifest

The plugin manifest must conform to a strict JSON Schema.
This schema defines the capabilities, menu items, and command palette contributions of the plugin.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "version": { "type": "string" },
    "description": { "type": "string" },
    "capabilities": {
      "type": "array",
      "items": { "type": "string" }
    },
    "menuItems": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": { "type": "string" },
          "command": { "type": "string" },
          "shortcut": { "type": "string" }
        },
        "required": ["label", "command"]
      }
    },
    "commands": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "category": { "type": "string" }
        },
        "required": ["id", "title"]
      }
    }
  },
  "required": ["name", "version", "capabilities"]
}
```

## WIT Interface Contracts

WebAssembly Interface Types (WIT) specify the boundary between the host and the plugins.

### Draft Session Interface

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
    decimal(double),
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

### Plugin Manifest Interface

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

### Plugin Lifecycle Interface

```wit
interface plugin-lifecycle {
  use plugin-manifest.{plugin-manifest};

  get-manifest: func() -> plugin-manifest;
  initialize: func() -> result<_, string>;
  shutdown: func() -> result<_, string>;
}
```

### Wizard Execution Interface

```wit
interface wizard-execution {
  use canopy:graph/draft-session.{draft-session-handle, draft-event, property-value};

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

## Host Instantiation and Imports Wiring

This section describes how the browser-based host instantiates the WASM Component Model plugins.
Since browsers do not natively support WASM components, the host transpiles them using the Bytecode Alliance `jco` tool.
The transpilation produces standard WebAssembly Core modules and an ES module wrapper.
The ES module wrapper exports an `instantiate` function that accepts host-provided imports.
The host registers its typescript-based `DraftSession` instances as WIT resource handles in the import object.

```typescript
import { instantiate } from './plugin-transpiled-module.js';

class HostDraftSessionHandle {
  private readonly draftSession: DraftSession;

  constructor(draftSession: DraftSession) {
    this.draftSession = draftSession;
  }

  applyEvents(events: any[]) {
    const mappedEvents = events.map(mapWitEventToTs);
    const result = this.draftSession.applyEvents(mappedEvents);
    if (!result.ok) {
      throw new Error(result.error.type);
    }
  }

  getParentRevision() {
    const result = this.draftSession.getParentRevision();
    if (!result.ok) {
      throw new Error(result.error.type);
    }
    return result.value;
  }

  getNode(nodeId: string) {
    const result = this.draftSession.getNode(nodeId);
    if (!result.ok) {
      throw new Error(result.error.type);
    }
    return mapTsNodeToWit(result.value);
  }

  queryNodes(queryString: string) {
    const result = this.draftSession.queryNodes(queryString);
    if (!result.ok) {
      throw new Error(result.error.type);
    }
    return result.value.map(mapTsNodeToWit);
  }
}

const imports = {
  'canopy:graph/draft-session': {
    DraftSessionHandle: HostDraftSessionHandle,
  },
};

const pluginInstance = await instantiate(wasmCoreBytes, imports);
```

## Wizard UI Step Manager and Form Renderer

The wizard user interface is managed dynamically inside `apps/web`.
When a plugin wizard is activated, the host creates a new `DraftSession` and instantiates a `wizard-session` resource.
The host renders a dialog wizard step using React.
The UI form inputs are natively rendered based on the `field-kind` returned in the form schema.
Keystrokes are buffered locally in the React component state to prevent performance bottlenecks.
When the user submits the step, the buffered inputs are translated into WIT values and submitted to the plugin via `handle-step-submission`.
The resulting events are applied to the `DraftSession` overlay, updating the live preview in the background.
If the wizard completes successfully, the staged events are committed to the graph.
If the wizard is canceled, the `DraftSession` is discarded and resources are cleaned up.

## Adversarial Review and Mitigations

This section analyzes potential architectural risks and specifies their mitigations.

### Binary Size Overhead

#### Risk

WebAssembly modules can be several megabytes in size.
Storing them as base64 properties within the syncable graph will cause database bloat and slow down sync.

#### Mitigation

The host requires Brotli compression of the WASM binary before it is stored in the database.
WASM binaries are stored as content-addressed blobs out-of-band rather than inside the event log payload.
The web client caches compiled WASM modules in IndexedDB to avoid recompiling them on every run.

### Runtime Memory Limits

#### Risk

Plugins can leak memory or allocate huge arrays.
This can crash the browser tab or degrade host application performance.

#### Mitigation

The host limits the maximum linear memory available to the WebAssembly instance during instantiation.
All guest allocations are scoped to the `wizard-session` resource lifecycle.
When a session is discarded, the host drops the WASM instance and garbage-collects the compiled sandbox.

### Isolation and Security

#### Risk

Malicious plugins could attempt cross-site scripting (XSS) or access sensitive host data.

#### Mitigation

Plugins cannot return raw HTML or JS strings.
The host renders the forms natively from the declarative schemas returned by the plugin.
API access to the graph is strictly limited to the `draft-session-handle` resource provided to the plugin.

### Serialization and Boundary Crossing

#### Risk

Transferring large graphs or thousands of events across the WASM boundary is slow and causes input lag.

#### Mitigation

The host buffers inputs locally and only performs a boundary crossing upon form submission.
Instead of sending the entire graph to the plugin, the plugin queries individual nodes on-demand using the host's imported query methods.

### Schema Evolution

#### Risk

As the plugin manifest version or host interfaces evolve, existing plugin nodes might fail to load.
Older staged events might become incompatible with newer plugin versions.

#### Mitigation

The manifest parser uses a version-tolerant schema validator.
The host exposes adapter layers to map legacy event types to new formats.
All plugin manifests must declare required capabilities to allow the host to gracefully disable incompatible modules.
