# Canopy Design Refinements v0.1.1

**Status:** Refinement of v0.1
**Date:** 2025-01-22
**Scope:** Resolves gaps and ambiguities in the 0.1 technical design

---

## 1. Property System Refinements

### 1.1 PropertyValue Type (Revised)

The original spec used `Date` inconsistently with `Instant`. Align on temporal types:

```typescript
/**
 * Property values supported in the graph.
 * Design decisions:
 * - No nested objects (use nodes + edges for composition)
 * - Arrays must be homogeneous
 * - Temporal types align with TC39 Temporal proposal
 */
type PropertyValue =
  | string
  | number // IEEE 754 double
  | boolean
  | Instant // Milliseconds since epoch (not Date)
  | NodeId // Reference to another node
  | PropertyValue[] // Homogeneous arrays only
  | null;

type Instant = Brand<number, 'Instant'>;

// Explicitly NOT supported:
// - Nested objects/maps (use relationships instead)
// - Heterogeneous arrays
// - Blob/binary (store as separate node with URL reference)
```

**Rationale:** Nested objects complicate CRDT merge semantics and query patterns. If you need structure, model it as nodes and edges.

### 1.2 PropertyChanges Definition

The `PropertyChanges` type was referenced but never defined. Here's the complete specification:

```typescript
/**
 * Represents changes to properties in an update event.
 * Uses explicit old/new values for:
 * - CRDT conflict detection
 * - Undo/redo implementation
 * - Audit trail clarity
 */
interface PropertyChanges {
  /** Properties that were set or updated */
  set: Map<
    PropertyKey,
    {
      oldValue: PropertyValue | undefined; // undefined if newly added
      newValue: PropertyValue;
    }
  >;

  /** Properties that were removed */
  removed: Map<
    PropertyKey,
    {
      oldValue: PropertyValue; // Must have existed
    }
  >;
}

type PropertyKey = Brand<string, 'PropertyKey'>;
```

**Event examples:**

```typescript
// Adding a new property
const addTitle: PropertyChanges = {
  set: new Map([['title', { oldValue: undefined, newValue: 'My Note' }]]),
  removed: new Map(),
};

// Updating existing property
const updateStatus: PropertyChanges = {
  set: new Map([['status', { oldValue: 'draft', newValue: 'published' }]]),
  removed: new Map(),
};

// Removing a property
const removeTag: PropertyChanges = {
  set: new Map(),
  removed: new Map([['deprecated_field', { oldValue: 'old_value' }]]),
};
```

### 1.3 Array Property CRDT Semantics

Arrays in properties use **replace-whole-array** semantics, not element-level CRDT:

```typescript
// Concurrent edits to array properties:
// Device A: tags = ['a', 'b', 'c']  @ T1
// Device B: tags = ['a', 'd']       @ T2

// Result (T2 > T1): tags = ['a', 'd']  (last-write-wins on whole array)
```

**Rationale:** Element-level array CRDTs (RGA, etc.) are complex and rarely needed for property arrays. For ordered collections requiring concurrent editing (like blocks), use `child_of` edges with fractional indexing.

---

## 2. Bootstrap Architecture: Graph-Stored MetaTypes

### 2.1 The Bootstrap Problem

The original spec stated MetaTypes are "hardcoded in the application (not stored as nodes)." This contradicts the meta-circular principle. Resolution:

**MetaTypes ARE nodes**, but they're bootstrapped before the graph can validate itself.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: Primordial Types (hardcoded TypeScript shapes)    │
│  - Used ONLY during bootstrap                               │
│  - Define the shape of MetaType nodes                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: MetaTypes (nodes in graph)                        │
│  - NodeType, EdgeType, PropertyType, ViewDefinition, Query  │
│  - Created during bootstrap from Layer 0 shapes             │
│  - Self-describing: NodeType has type = NodeType            │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: SystemTypes (nodes in graph)                      │
│  - TextBlock, CodeBlock, Concept, Project, Renderer, etc.   │
│  - Validated against Layer 1 MetaTypes                      │
│  - Shipped with application, versioned                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: UserTypes (nodes in graph)                        │
│  - Custom types created by users                            │
│  - Validated against Layer 1 MetaTypes                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Primordial Types (TypeScript Only)

These exist only in TypeScript code, used to bootstrap:

```typescript
/**
 * Primordial types - the TypeScript shapes used to create MetaType nodes.
 * These are NOT stored in the graph; they're the template for creating
 * the first MetaType nodes during bootstrap.
 */

interface PrimordialNodeType {
  id: NodeTypeId;
  name: string;
  description: string;
  properties: PrimordialPropertyDefinition[];
  requiredProperties: PropertyKey[];
  validOutgoingEdges: EdgeTypeId[];
  validIncomingEdges: EdgeTypeId[];
  abstract: boolean;
  extends?: NodeTypeId;
}

interface PrimordialEdgeType {
  id: EdgeTypeId;
  name: string;
  description: string;
  sourceTypes: NodeTypeId[];
  targetTypes: NodeTypeId[];
  properties: PrimordialPropertyDefinition[];
  cardinality: {
    source: 'one' | 'many';
    target: 'one' | 'many';
  };
  constraints: {
    transitive: boolean;
    symmetric: boolean;
    inverse?: EdgeTypeId;
  };
}

interface PrimordialPropertyDefinition {
  name: PropertyKey;
  type: PropertyTypeId;
  required: boolean;
  defaultValue?: PropertyValue;
  validation?: ValidationRule[];
}
```

### 2.3 Bootstrap Sequence

```typescript
/**
 * Bootstrap creates the minimal graph needed for self-description.
 * After bootstrap, the graph can validate itself.
 */
function bootstrapGraph(): Graph {
  let graph = emptyGraph();

  // 1. Create PropertyType MetaType (defines what property types look like)
  graph = createBootstrapNode(graph, {
    id: 'meta:property-type' as NodeId,
    type: 'meta:node-type' as NodeTypeId, // Self-referential
    properties: {
      name: 'PropertyType',
      description: 'Defines a property type (string, number, etc.)',
      // ... property definitions for PropertyType
    },
  });

  // 2. Create NodeType MetaType (defines what node types look like)
  graph = createBootstrapNode(graph, {
    id: 'meta:node-type' as NodeId,
    type: 'meta:node-type' as NodeTypeId, // Self-referential!
    properties: {
      name: 'NodeType',
      description: 'Defines a type of node',
      properties: [
        /* PropertyDefinition[] schema */
      ],
      requiredProperties: [
        /* string[] */
      ],
      // ...
    },
  });

  // 3. Create EdgeType MetaType
  graph = createBootstrapNode(graph, {
    id: 'meta:edge-type' as NodeId,
    type: 'meta:node-type' as NodeTypeId,
    properties: {
      name: 'EdgeType',
      // ...
    },
  });

  // 4. Create core edges between MetaTypes
  graph = createBootstrapEdge(graph, {
    id: generateEdgeId(),
    type: 'meta:has-property' as EdgeTypeId,
    source: 'meta:node-type' as NodeId,
    target: 'meta:property-type' as NodeId,
    properties: {},
  });

  // 5. Create SystemTypes (TextBlock, CodeBlock, etc.)
  graph = createSystemTypes(graph);

  // 6. Create Renderer MetaType (NEW - see Section 4)
  graph = createRendererMetaType(graph);

  return graph;
}

/**
 * Bootstrap node creation bypasses validation (chicken-egg problem).
 * After bootstrap completes, all subsequent mutations go through
 * normal validation against the now-existing MetaTypes.
 */
function createBootstrapNode(graph: Graph, node: Node): Graph {
  // Direct insertion, no validation
  return {
    ...graph,
    nodes: graph.nodes.set(node.id, node),
  };
}
```

### 2.4 Well-Known IDs

MetaType and SystemType nodes have well-known IDs for reliable lookup:

```typescript
// MetaType IDs (Layer 1)
const META_NODE_TYPE = 'meta:node-type' as NodeTypeId;
const META_EDGE_TYPE = 'meta:edge-type' as NodeTypeId;
const META_PROPERTY_TYPE = 'meta:property-type' as NodeTypeId;
const META_QUERY = 'meta:query' as NodeTypeId;
const META_VIEW_DEF = 'meta:view-definition' as NodeTypeId;
const META_RENDERER = 'meta:renderer' as NodeTypeId;

// SystemType IDs (Layer 2) - use 'system:' prefix
const SYSTEM_TEXT_BLOCK = 'system:nodetype:text-block' as NodeTypeId;
const SYSTEM_CODE_BLOCK = 'system:nodetype:code-block' as NodeTypeId;
const SYSTEM_CONCEPT = 'system:nodetype:concept' as NodeTypeId;
const SYSTEM_CHILD_OF = 'system:edgetype:child-of' as EdgeTypeId;

// UserType IDs (Layer 3) - use 'user:' prefix
// Generated: 'user:nodetype:{uuid}' or 'user:nodetype:{name}'
```

---

## 3. Query Layer: ISO GQL Strategy

### 3.1 Updated Technology Decision

**Target:** ISO GQL (ISO/IEC 39075)
**Interim:** Cypher subset for development velocity
**Migration:** 2026-2027 when tooling matures

The ISO GQL standard was published in April 2024. Tooling is immature but progressing.

### 3.2 Query Execution Architecture

```typescript
/**
 * Query execution over in-memory TypeScript graph.
 *
 * Strategy: Compile query AST to TypeScript predicates.
 * We don't embed Neo4j - we interpret queries against our Graph structure.
 */

interface QueryEngine {
  /** Parse and validate query syntax */
  parse(queryString: string, language: 'cypher' | 'gql'): Result<QueryAST, ParseError>;

  /** Execute parsed query against graph */
  execute<T>(
    graph: Graph,
    ast: QueryAST,
    params: QueryParams,
  ): Result<QueryResult<T>, ExecutionError>;

  /** Validate query against current schema */
  validate(ast: QueryAST, graph: Graph): ValidationResult;
}

interface QueryAST {
  type: 'match' | 'create' | 'merge' | 'delete' | 'return';
  patterns: PatternAST[];
  where?: PredicateAST;
  return?: ReturnAST;
  orderBy?: OrderAST;
  limit?: number;
  skip?: number;
}

interface QueryResult<T> {
  rows: T[];
  columns: string[];
  executionTime: number;
  nodesScanned: number;
  edgesScanned: number;
}
```

### 3.3 Execution Implementation

```typescript
/**
 * Pattern matching compiles to predicate functions.
 * No external query engine dependency.
 */

type NodePredicate = (node: Node, graph: Graph) => boolean;
type EdgePredicate = (edge: Edge, graph: Graph) => boolean;
type BindingPredicate = (bindings: Bindings, graph: Graph) => boolean;

interface CompiledQuery {
  /** Initial node scan filter */
  nodeScan: NodePredicate;

  /** Edge traversal predicates */
  edgeTraversals: EdgeTraversal[];

  /** WHERE clause predicate */
  filter: BindingPredicate;

  /** Projection function */
  project: (bindings: Bindings) => unknown;
}

function compileQuery(ast: QueryAST): CompiledQuery {
  // Example: MATCH (n:Concept {status: 'active'})-[:child_of]->(parent)
  // Compiles to:
  return {
    nodeScan: (node) =>
      node.type === 'system:nodetype:concept' && node.properties.get('status') === 'active',

    edgeTraversals: [
      {
        edgeType: 'system:edgetype:child-of',
        direction: 'outgoing',
        targetBinding: 'parent',
      },
    ],

    filter: () => true, // No additional WHERE

    project: (bindings) => ({
      n: bindings.get('n'),
      parent: bindings.get('parent'),
    }),
  };
}

function executeQuery<T>(graph: Graph, compiled: CompiledQuery): QueryResult<T> {
  const startTime = performance.now();
  let nodesScanned = 0;
  let edgesScanned = 0;

  // 1. Scan nodes matching initial pattern
  const initialMatches: Bindings[] = [];
  for (const node of graph.nodes.values()) {
    nodesScanned++;
    if (compiled.nodeScan(node, graph)) {
      initialMatches.push(new Map([['n', node]]));
    }
  }

  // 2. Expand through edge traversals
  let currentBindings = initialMatches;
  for (const traversal of compiled.edgeTraversals) {
    currentBindings = expandTraversal(graph, currentBindings, traversal, () => edgesScanned++);
  }

  // 3. Apply WHERE filter
  const filtered = currentBindings.filter((b) => compiled.filter(b, graph));

  // 4. Project results
  const rows = filtered.map(compiled.project) as T[];

  return {
    rows,
    columns: Array.from(compiled.project(new Map()).keys()),
    executionTime: performance.now() - startTime,
    nodesScanned,
    edgesScanned,
  };
}
```

### 3.4 Query Node Schema

```typescript
// Query definitions stored as nodes
interface QueryNode {
  id: NodeId;
  type: typeof META_QUERY;
  properties: {
    name: string;
    description: string;

    // Query content
    language: 'cypher' | 'gql';
    queryString: string;

    // Parameter definitions
    parameters: QueryParameter[];

    // Caching hints
    cacheable: boolean;
    cacheMaxAge?: number; // seconds

    // Metadata
    version: string;
    deprecated: boolean;
    deprecationMessage?: string;
  };
}

interface QueryParameter {
  name: string;
  type: PropertyTypeId;
  required: boolean;
  defaultValue?: PropertyValue;
  description: string;
}
```

### 3.5 GQL Migration Path

```typescript
/**
 * When ISO GQL tooling matures:
 * 1. Add GQL parser alongside Cypher parser
 * 2. Both compile to same QueryAST
 * 3. Provide automated Cypher→GQL translation for stored queries
 * 4. Deprecate Cypher support after migration period
 */

interface QueryMigration {
  fromLanguage: 'cypher';
  toLanguage: 'gql';

  /** Translate query string */
  translate(cypher: string): Result<string, TranslationError>;

  /** Migrate all Query nodes in graph */
  migrateGraph(graph: Graph): Result<GraphEvent[], MigrationError>;
}
```

---

## 4. Renderer System: Fully Graph-Stored

### 4.1 Renderer as MetaType

Renderers are nodes, not just identifiers:

```typescript
// Renderer MetaType definition
interface RendererMetaType {
  id: typeof META_RENDERER;
  type: typeof META_NODE_TYPE;
  properties: {
    name: 'Renderer';
    description: 'Defines how to render nodes of a type';
    properties: [
      { name: 'name'; type: 'string'; required: true },
      { name: 'description'; type: 'string'; required: false },
      { name: 'rendererKind'; type: 'string'; required: true }, // 'system' | 'wasm' | 'component'
      { name: 'entryPoint'; type: 'string'; required: true },
      { name: 'permissions'; type: 'string[]'; required: true },
      { name: 'configSchema'; type: 'object'; required: false },
    ];
  };
}
```

### 4.2 System Renderer Nodes

Built-in renderers are nodes created during bootstrap:

```typescript
// System renderers created during bootstrap
const SYSTEM_RENDERERS = {
  markdown: {
    id: 'system:renderer:markdown' as NodeId,
    type: META_RENDERER,
    properties: {
      name: 'Markdown Renderer',
      description: 'Renders markdown content to HTML',
      rendererKind: 'system',
      entryPoint: 'system:markdown', // Maps to built-in implementation
      permissions: ['read-graph'],
      configSchema: {
        syntaxHighlighting: { type: 'boolean', default: true },
        mathSupport: { type: 'boolean', default: true },
        wikiLinkResolution: { type: 'boolean', default: true },
      },
    },
  },

  codeBlock: {
    id: 'system:renderer:code-block' as NodeId,
    type: META_RENDERER,
    properties: {
      name: 'Code Block Renderer',
      rendererKind: 'system',
      entryPoint: 'system:code-block',
      permissions: ['read-graph'],
      configSchema: {
        theme: { type: 'string', default: 'github-dark' },
        lineNumbers: { type: 'boolean', default: true },
        copyButton: { type: 'boolean', default: true },
      },
    },
  },

  container: {
    id: 'system:renderer:container' as NodeId,
    type: META_RENDERER,
    properties: {
      name: 'Container Renderer',
      description: 'Renders nodes with children by querying child_of edges',
      rendererKind: 'system',
      entryPoint: 'system:container',
      permissions: ['read-graph', 'execute-query'],
    },
  },
};
```

### 4.3 WASM Renderer Nodes

User-provided WASM renderers:

```typescript
interface WasmRendererNode {
  id: NodeId
  type: typeof META_RENDERER
  properties: {
    name: string
    description: string
    rendererKind: 'wasm'

    // WASM module reference
    wasmModuleId: NodeId  // Reference to WasmModule node
    entryPoint: string    // Export name, e.g., 'render'

    // Security
    permissions: RendererPermission[]

    // Configuration
    configSchema: Record<string, PropertyDefinition>
  }
}

type RendererPermission =
  | 'read-graph'        // Can read nodes/edges
  | 'execute-query'     // Can run queries
  | 'read-settings'     // Can read settings nodes
  // NOT allowed: write-graph, network, filesystem

interface WasmModuleNode {
  id: NodeId
  type: 'system:nodetype:wasm-module' as NodeTypeId
  properties: {
    name: string
    version: string
    binary: string  // Base64-encoded WASM
    exports: string[]
    imports: string[]
    hash: string    // SHA-256 for integrity
  }
}
```

### 4.4 Renderer Interface

```typescript
/**
 * The contract between the rendering system and renderers.
 * Both system and WASM renderers implement this interface.
 */
interface Renderer {
  /**
   * Render a node to output.
   *
   * @param context - Everything the renderer needs
   * @returns Rendered output or error
   */
  render(context: RenderContext): Result<RenderedOutput, RenderError>;
}

interface RenderContext {
  /** The node being rendered */
  node: Node;

  /** Read-only graph access */
  graph: ReadonlyGraph;

  /** Resolved configuration from ViewDefinition */
  config: Record<string, PropertyValue>;

  /** Query executor (if permitted) */
  query?: QueryExecutor;

  /** Child renderer (for recursive rendering) */
  renderChild?: (nodeId: NodeId) => Result<RenderedOutput, RenderError>;
}

/**
 * Rendered output supports multiple formats.
 * The UI layer chooses which representation to use.
 */
interface RenderedOutput {
  /** Primary output format */
  format: 'html' | 'react' | 'markdown' | 'json';

  /** The rendered content */
  content: string | ReactElement | object;

  /** Optional metadata */
  metadata?: {
    /** Nodes referenced (for cache invalidation) */
    dependencies: NodeId[];

    /** Suggested cache duration */
    cacheable: boolean;
    maxAge?: number;

    /** Accessibility info */
    ariaLabel?: string;
  };
}
```

### 4.5 ViewDefinition Refinement

```typescript
interface ViewDefinitionNode {
  id: NodeId;
  type: typeof META_VIEW_DEF;
  properties: {
    name: string;
    description: string;

    /** Which node type this view renders */
    targetNodeType: NodeTypeId;

    /** Which renderer to use */
    rendererId: NodeId; // Reference to Renderer node

    /** Configuration passed to renderer */
    rendererConfig: Record<string, PropertyValue>;

    /** Optional: extend another ViewDefinition */
    extends?: NodeId;

    /** Priority for view resolution (higher wins) */
    priority: number;

    /** Applicability predicate (optional, for conditional views) */
    condition?: {
      queryId: NodeId; // Query that returns boolean
      // e.g., "does this node have children?"
    };
  };
}
```

---

## 5. CRDT Merge Semantics

### 5.1 Event Ordering

Events are ordered by:

1. UUIDv7 timestamp (primary)
2. UUIDv7 random bits (tiebreaker for same-millisecond)

```typescript
function compareEvents(a: GraphEvent, b: GraphEvent): number {
  // UUIDv7 is lexicographically sortable
  return a.timestamp.localeCompare(b.timestamp);
}
```

### 5.2 Property Conflict Resolution

**Last-Write-Wins (LWW) with full event preservation:**

```typescript
/**
 * Both events are stored in the log.
 * Projection applies them in timestamp order.
 * The later timestamp's value wins for each property key.
 */

// Device A @ T1: set title = "Draft"
// Device B @ T2: set title = "Final"  (T2 > T1)
// Device A @ T3: set status = "review"

// After sync, event log contains all three events.
// Projected state: { title: "Final", status: "review" }
```

**Per-property LWW (not per-node):**

```typescript
// Device A @ T1: set { title: "A's title", status: "draft" }
// Device B @ T2: set { title: "B's title" }  (T2 > T1, no status change)

// Result: { title: "B's title", status: "draft" }
// Each property tracks its own last-write timestamp
```

### 5.3 Edge Conflict Resolution

**Creation is additive:**

```typescript
// Device A: create edge E1 (A)-[r1]->(B)
// Device B: create edge E2 (A)-[r2]->(B)

// Result: both edges exist (they have different IDs)
```

**Deletion with concurrent update:**

```typescript
// Device A @ T1: delete edge E1
// Device B @ T2: update edge E1 properties (T2 > T1)

// Result: Edge is deleted (delete wins over update)
// The update event becomes a no-op when applied to missing edge
```

### 5.4 Node Deletion Semantics

```typescript
/**
 * Node deletion is a tombstone, not physical removal.
 */

interface NodeDeletedEvent {
  type: 'NodeDeleted';
  id: NodeId;
  timestamp: Instant;
}

/**
 * Projection behavior:
 * - Node marked as deleted in graph (not removed)
 * - Queries exclude deleted nodes by default
 * - Events targeting deleted nodes are no-ops
 * - Edges to/from deleted nodes remain (for referential queries)
 */

function applyNodeDeleted(graph: Graph, event: NodeDeletedEvent): Graph {
  const node = graph.nodes.get(event.id);
  if (!node) return graph; // Already deleted or never existed

  return {
    ...graph,
    nodes: graph.nodes.set(event.id, {
      ...node,
      metadata: {
        ...node.metadata,
        deleted: true,
        deletedAt: event.timestamp,
      },
    }),
  };
}
```

### 5.5 Text Content CRDT

For `content` properties containing rich text (TextBlock, MarkdownNode):

```typescript
/**
 * Text content uses Yjs Y.Text for character-level CRDT.
 * The property value stores a Yjs document ID.
 *
 * This is separate from the event log - text editing uses
 * Yjs's native CRDT, synced independently.
 */

interface TextContentProperty {
  /** Reference to Yjs document */
  yjsDocId: string;

  /** Snapshot for non-Yjs clients (read-only) */
  plainText: string;

  /** Last Yjs state vector (for sync) */
  stateVector: Uint8Array;
}
```

---

## 6. Resolved Open Questions

### 6.1 WikiLink Syntax

**Decision:** UUID-based with optional alias

```
Syntax:   [[node:{uuid}]] or [[node:{uuid}|Display Text]]
Example:  [[node:0190a5b2-7c3d-7000-8000-000000000001|Async I/O Concepts]]

Resolution:
1. Extract UUID from wikilink
2. Look up node by ID
3. If node exists: render as link
4. If node missing: render as broken link (red, no navigation)
5. Alias is display-only; doesn't affect resolution
```

**Alternative syntax for name-based lookup (future):**

```
[[?name:Async I/O]]  // Query-based, resolves at render time
```

### 6.2 Tree Structure Semantics

**Decision:** Unlimited depth, explicit max for rendering

```typescript
interface TreeConfig {
  /** Maximum depth for recursive queries (performance) */
  maxQueryDepth: number; // Default: 10

  /** Maximum depth for recursive rendering (UX) */
  maxRenderDepth: number; // Default: 5

  /** Behavior when limit hit */
  depthLimitBehavior: 'truncate' | 'collapse' | 'paginate';
}
```

**Cycles:** Detected and broken at render time. Query returns cycle marker.

### 6.3 Dashboard Nodes

**Decision:** Dashboard is a ViewDefinition with grid layout:

```typescript
interface DashboardViewDefinition extends ViewDefinitionNode {
  properties: {
    // ... standard ViewDefinition properties

    layout: 'grid' | 'flex' | 'masonry';
    columns: number;

    /** Panels are embedded QueryBlocks */
    panels: DashboardPanel[];
  };
}

interface DashboardPanel {
  /** Query to execute */
  queryId: NodeId;

  /** View for results */
  viewId: NodeId;

  /** Grid position */
  gridArea: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
  };

  /** Refresh interval (0 = manual) */
  refreshSeconds: number;
}
```

### 6.4 Performance: Caching Strategy

```typescript
interface RenderCache {
  /** Cache key: node ID + view ID + config hash */
  key: string;

  /** Cached output */
  output: RenderedOutput;

  /** Dependencies (invalidate if any change) */
  dependencies: Set<NodeId>;

  /** Expiration */
  expiresAt: Instant;
}

/**
 * Cache invalidation:
 * - On NodePropertiesUpdated: invalidate caches with that node in dependencies
 * - On EdgeCreated/Deleted: invalidate caches for source and target nodes
 * - On ViewDefinition change: invalidate all caches using that view
 * - On Renderer change: invalidate all caches using that renderer
 */
```

---

## 7. Application vs Graph Boundary

### 7.1 What Lives in the Graph

| Entity        | Stored As     | Notes                                                             |
| ------------- | ------------- | ----------------------------------------------------------------- |
| MetaTypes     | Nodes         | NodeType, EdgeType, PropertyType, Query, ViewDefinition, Renderer |
| SystemTypes   | Nodes         | TextBlock, CodeBlock, Concept, etc.                               |
| UserTypes     | Nodes         | Custom types                                                      |
| Content       | Nodes + Edges | All user content                                                  |
| Configuration | Nodes         | Settings, preferences                                             |
| WASM Modules  | Nodes         | Binary stored as base64                                           |
| Queries       | Nodes         | Query strings stored in graph                                     |
| Views         | Nodes         | ViewDefinition nodes                                              |

### 7.2 What Lives in Application Code

| Entity           | Location         | Notes                           |
| ---------------- | ---------------- | ------------------------------- |
| Primordial Types | TypeScript       | Used only during bootstrap      |
| Bootstrap Logic  | TypeScript       | Creates initial graph           |
| Query Parser     | TypeScript       | Parses Cypher/GQL to AST        |
| Query Executor   | TypeScript       | Runs queries against graph      |
| System Renderers | TypeScript       | Built-in render implementations |
| WASM Runtime     | TypeScript       | Executes WASM renderers         |
| Yjs Integration  | TypeScript       | CRDT synchronization            |
| Storage Adapters | TypeScript       | SQLite, cloud backends          |
| UI Components    | TypeScript/React | Presentation layer              |

### 7.3 Startup Sequence

```typescript
async function startCanopy(storage: StorageBackend): Promise<Application> {
  // 1. Load events from storage
  const events = await storage.loadEvents();

  // 2. Check if bootstrap needed
  if (events.length === 0) {
    // First run: create bootstrap events
    const bootstrapEvents = createBootstrapEvents();
    await storage.appendEvents(bootstrapEvents);
    events.push(...bootstrapEvents);
  }

  // 3. Project graph from events
  const graph = projectGraph(events);

  // 4. Validate graph integrity
  const validation = validateGraphIntegrity(graph);
  if (validation.hasErrors) {
    throw new CorruptGraphError(validation.errors);
  }

  // 5. Initialize query engine
  const queryEngine = createQueryEngine(graph);

  // 6. Initialize render system
  const renderSystem = createRenderSystem(graph, queryEngine);

  // 7. Initialize sync (Yjs)
  const sync = await initializeSync(storage, graph);

  return { graph, queryEngine, renderSystem, sync, storage };
}
```

---

## 8. Summary of Changes from v0.1

| Section                 | Change                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| 2.3 Properties          | Removed `Date`, aligned on `Instant`; prohibited nested objects         |
| 4.1 Events              | Added `PropertyChanges` definition with old/new values                  |
| 5.2 MetaTypes           | MetaTypes are now nodes, not hardcoded; added bootstrap layer           |
| 6.x View System         | Renderers are nodes; defined `Renderer` and `RenderedOutput` interfaces |
| 7.x Query Layer         | Updated to target ISO GQL; defined execution architecture               |
| 9.2 Conflict Resolution | Detailed per-property LWW; text CRDT integration                        |
| Appendix C              | Resolved WikiLink, tree depth, dashboard, caching questions             |
| New: Section 7          | Clarified application vs graph boundary                                 |

---

_This refinement document should be merged into the main design doc once validated._
