import type { NodeId, TypeId } from './identifiers';
import type { Node } from './node';
import type { Edge } from './edge';
import type { PropertyValue } from './properties';
import type { ScalarValue } from './scalars';
import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type { ReadModelPort } from './read-model';
import { fromThrowable } from './result';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from './system';
import { asTypeId } from './factories';

/**
 * Pre-computed settings, view, and read-model indexes for O(1)/O(delta) lookup.
 *
 * `typeIndex`, `adjacencyOut`, `adjacencyIn`, and `propertyEquality` back the `ReadModelPort`
 * (see `read-model.ts` and `createIndexedReadModel` below). As of this change they are populated
 * by a full scan in `buildGraphIndexes` only -- O(delta) incremental maintenance inside
 * `incrementalUpdateIndexes`/`applyOneEvent` is a separate, follow-on change. Until that lands,
 * these four fields are only guaranteed correct immediately after `buildGraphIndexes`/
 * `getGraphIndexes`, not across incremental merges -- no consumer reads them yet.
 */
export interface GraphIndexes {
  readonly settingsSchemas: ReadonlyMap<string, Node>; // key -> SettingsSchema node
  readonly userSettings: ReadonlyMap<string, PropertyValue>; // schemaNodeId\0scopeType\0scopeTarget -> parsed value (deeply frozen)
  readonly viewOverrides: ReadonlyMap<NodeId, Node>; // nodeId -> ViewDefinition node
  readonly defaultViews: ReadonlyMap<TypeId, Node>; // typeId -> ViewDefinition node
  readonly typeIndex: ReadonlyMap<TypeId, ReadonlySet<NodeId>>; // typeId -> node IDs of that type
  readonly adjacencyOut: ReadonlyMap<NodeId, ReadonlyMap<TypeId, ReadonlySet<NodeId>>>; // nodeId -> edgeType -> target node IDs
  readonly adjacencyIn: ReadonlyMap<NodeId, ReadonlyMap<TypeId, ReadonlySet<NodeId>>>; // nodeId -> edgeType -> source node IDs
  readonly propertyEquality: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<NodeId>>>; // property -> serialized scalar value -> node IDs
}

/**
 * Serializes a scalar property value into a map key that distinguishes values of different
 * runtime types (e.g. number `1` vs string `"1"`) that would otherwise collide once stringified.
 * Array-valued properties are never passed here -- see `nodesWhereEquals`.
 */
/** `Array.isArray` alone does not narrow a `readonly T[]` union member reliably; wrap it in an explicit predicate. */
function isScalarValue(value: PropertyValue): value is ScalarValue {
  return !Array.isArray(value);
}

function serializeScalarForIndex(value: ScalarValue): string {
  if (value === null) return 'null:';
  if (typeof value === 'object') {
    return `ref:${value.graph}:${value.target}`;
  }
  return `${typeof value}:${String(value)}`;
}

/**
 * Records `nodeId` under `propertyEquality[property][serializedValue]`, creating buckets as
 * needed. Arrays are never indexed -- see `nodesWhereEquals`. Extracted to its own function (with
 * its own early return) rather than an early `continue` in the caller's loop, since that loop is
 * itself nested inside the per-node scan in `buildGraphIndexes`.
 */
function indexNodeProperty(
  // eslint-disable-next-line functional/prefer-immutable-types
  propertyEquality: Map<string, Map<string, Set<NodeId>>>,
  nodeId: NodeId,
  property: string,
  value: PropertyValue,
  // eslint-disable-next-line functional/no-return-void
): void {
  if (!isScalarValue(value)) return;
  const valueKey = serializeScalarForIndex(value);
  const byProperty = propertyEquality.get(property) ?? new Map<string, Set<NodeId>>();
  const byValue = byProperty.get(valueKey) ?? new Set<NodeId>();
  // eslint-disable-next-line functional/immutable-data
  byValue.add(nodeId);
  // eslint-disable-next-line functional/immutable-data
  byProperty.set(valueKey, byValue);
  // eslint-disable-next-line functional/immutable-data
  propertyEquality.set(property, byProperty);
}

/** Records `neighbourId` under `adjacency[nodeId][edgeType]`, creating buckets as needed. */
function addNeighbour(
  // eslint-disable-next-line functional/prefer-immutable-types
  adjacency: Map<NodeId, Map<TypeId, Set<NodeId>>>,
  nodeId: NodeId,
  edgeType: TypeId,
  neighbourId: NodeId,
  // eslint-disable-next-line functional/no-return-void
): void {
  const byEdgeType = adjacency.get(nodeId) ?? new Map<TypeId, Set<NodeId>>();
  const bucket = byEdgeType.get(edgeType) ?? new Set<NodeId>();
  // eslint-disable-next-line functional/immutable-data
  bucket.add(neighbourId);
  // eslint-disable-next-line functional/immutable-data
  byEdgeType.set(edgeType, bucket);
  // eslint-disable-next-line functional/immutable-data
  adjacency.set(nodeId, byEdgeType);
}

/**
 * Recursively freezes an object to ensure absolute immutability of cached values.
 */
function deepFreeze<T>(object: T): T {
  if (object === null || typeof object !== 'object') {
    return object;
  }
  // eslint-disable-next-line functional/no-loop-statements
  for (const value of Object.values(object)) {
    deepFreeze(value);
  }
  return Object.freeze(object);
}

/**
 * Builds the graph indexes from scratch using a single scan of the graph nodes and edges.
 */
// eslint-disable-next-line max-lines-per-function
export function buildGraphIndexes(graph: Graph): GraphIndexes {
  const settingsSchemas = new Map<string, Node>();
  const userSettings = new Map<string, PropertyValue>();
  const typeIndex = new Map<TypeId, Set<NodeId>>();
  const propertyEquality = new Map<string, Map<string, Set<NodeId>>>();

  // 1. Scan nodes for SettingsSchema and UserSetting, and populate the type/property-equality
  //    read-model indexes (every node, not just settings-related ones).
  // eslint-disable-next-line functional/no-loop-statements
  for (const node of graph.nodes.values()) {
    if (node.type === SYSTEM_IDS.SETTINGS_SCHEMA) {
      const key = node.properties.get('key');
      if (typeof key === 'string') {
        // eslint-disable-next-line functional/immutable-data
        settingsSchemas.set(key, node);
      }
    } else if (node.type === SYSTEM_IDS.USER_SETTING) {
      const schemaId = node.properties.get('schemaId');
      const scopeType = node.properties.get('scopeType');
      const scopeTarget = node.properties.get('scopeTarget');
      const valueRaw = node.properties.get('value');

      if (typeof schemaId === 'string' && typeof scopeType === 'string') {
        const key = `${schemaId}\0${scopeType}\0${typeof scopeTarget === 'string' ? scopeTarget : ''}`;
        if (typeof valueRaw === 'string') {
          const result = fromThrowable(() => JSON.parse(valueRaw) as PropertyValue);
          if (result.ok) {
            // eslint-disable-next-line functional/immutable-data
            userSettings.set(key, deepFreeze(result.value));
          }
        }
      }
    }

    const typeBucket = typeIndex.get(node.type) ?? new Set<NodeId>();
    // eslint-disable-next-line functional/immutable-data
    typeBucket.add(node.id);
    // eslint-disable-next-line functional/immutable-data
    typeIndex.set(node.type, typeBucket);

    // eslint-disable-next-line functional/no-loop-statements
    for (const [property, value] of node.properties) {
      indexNodeProperty(propertyEquality, node.id, property, value);
    }
  }

  // 2. Scan edges for ViewOverride and DefaultView, and populate the adjacency read-model
  //    indexes (every edge, not just view-related ones).
  // eslint-disable-next-line functional/prefer-immutable-types
  const overrideEdges: Edge[] = [];
  // eslint-disable-next-line functional/prefer-immutable-types
  const defaultEdges: Edge[] = [];
  const adjacencyOut = new Map<NodeId, Map<TypeId, Set<NodeId>>>();
  const adjacencyIn = new Map<NodeId, Map<TypeId, Set<NodeId>>>();

  // eslint-disable-next-line functional/no-loop-statements
  for (const edge of graph.edges.values()) {
    if (edge.type === SYSTEM_EDGE_TYPES.VIEW_OVERRIDE) {
      // eslint-disable-next-line functional/immutable-data
      overrideEdges.push(edge);
    } else if (edge.type === SYSTEM_EDGE_TYPES.DEFAULT_VIEW) {
      // eslint-disable-next-line functional/immutable-data
      defaultEdges.push(edge);
    }

    addNeighbour(adjacencyOut, edge.source, edge.type, edge.target);
    addNeighbour(adjacencyIn, edge.target, edge.type, edge.source);
  }

  // 3. Group and resolve view override edges deterministically
  const overridesBySource = new Map<NodeId, Edge[]>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const edge of overrideEdges) {
    const list = overridesBySource.get(edge.source) ?? [];
    // eslint-disable-next-line functional/immutable-data
    list.push(edge);
    // eslint-disable-next-line functional/immutable-data
    overridesBySource.set(edge.source, list);
  }

  const viewOverrides = new Map<NodeId, Node>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [source, list] of overridesBySource) {
    // eslint-disable-next-line functional/immutable-data
    list.sort((a, b) => {
      if (a.metadata.created > b.metadata.created) return -1;
      if (a.metadata.created < b.metadata.created) return 1;
      return b.id.localeCompare(a.id);
    });

    const matchingEdge = list.find((edge) => {
      const targetNode = graph.nodes.get(edge.target);
      return targetNode !== undefined && targetNode.type === SYSTEM_IDS.VIEW_DEFINITION;
    });
    if (matchingEdge) {
      const targetNode = graph.nodes.get(matchingEdge.target);
      if (targetNode) {
        // eslint-disable-next-line functional/immutable-data
        viewOverrides.set(source, targetNode);
      }
    }
  }

  // 4. Group and resolve default view edges deterministically
  const defaultsBySource = new Map<TypeId, Edge[]>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const edge of defaultEdges) {
    const list = defaultsBySource.get(asTypeId(edge.source)) ?? [];
    // eslint-disable-next-line functional/immutable-data
    list.push(edge);
    // eslint-disable-next-line functional/immutable-data
    defaultsBySource.set(asTypeId(edge.source), list);
  }

  const defaultViews = new Map<TypeId, Node>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [source, list] of defaultsBySource) {
    // eslint-disable-next-line functional/immutable-data
    list.sort((a, b) => {
      if (a.metadata.created > b.metadata.created) return -1;
      if (a.metadata.created < b.metadata.created) return 1;
      return b.id.localeCompare(a.id);
    });

    const matchingEdge = list.find((edge) => {
      const targetNode = graph.nodes.get(edge.target);
      return targetNode !== undefined && targetNode.type === SYSTEM_IDS.VIEW_DEFINITION;
    });
    if (matchingEdge) {
      const targetNode = graph.nodes.get(matchingEdge.target);
      if (targetNode) {
        // eslint-disable-next-line functional/immutable-data
        defaultViews.set(source, targetNode);
      }
    }
  }

  return {
    settingsSchemas,
    userSettings,
    viewOverrides,
    defaultViews,
    typeIndex,
    adjacencyOut,
    adjacencyIn,
    propertyEquality,
  };
}

// Global WeakMap to store cached indexes for Graph references
const graphCache = new WeakMap<Graph, GraphIndexes>();

/**
 * Gets the pre-computed indexes for a graph, lazily building and caching them if needed.
 */
export function getGraphIndexes(graph: Graph): GraphIndexes {
  const cached = graphCache.get(graph);
  if (cached) {
    return cached;
  }
  const indexes = buildGraphIndexes(graph);
  graphCache.set(graph, indexes);
  // eslint-disable-next-line functional/immutable-data
  (graph as { _indexes?: GraphIndexes | undefined })._indexes = indexes;
  return indexes;
}

/**
 * Checks if an event modifies settings schema, user settings, or view overrides.
 */
function isConfigEvent(event: GraphEvent, graph: Graph): boolean {
  if (
    event.type === 'EdgeCreated' &&
    (event.edgeType === SYSTEM_EDGE_TYPES.VIEW_OVERRIDE ||
      event.edgeType === SYSTEM_EDGE_TYPES.DEFAULT_VIEW)
  ) {
    return true;
  }
  if (event.type === 'EdgeDeleted' || event.type === 'EdgePropertiesUpdated') {
    const edge = graph.edges.get(event.id);
    if (
      edge &&
      (edge.type === SYSTEM_EDGE_TYPES.VIEW_OVERRIDE ||
        edge.type === SYSTEM_EDGE_TYPES.DEFAULT_VIEW)
    ) {
      return true;
    }
  }
  if (
    event.type === 'NodeCreated' &&
    (event.nodeType === SYSTEM_IDS.SETTINGS_SCHEMA || event.nodeType === SYSTEM_IDS.USER_SETTING)
  ) {
    return true;
  }
  if (event.type === 'NodePropertiesUpdated' || event.type === 'NodeDeleted') {
    const node = graph.nodes.get(event.id);
    if (
      node &&
      (node.type === SYSTEM_IDS.SETTINGS_SCHEMA || node.type === SYSTEM_IDS.USER_SETTING)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Incrementally updates the index reference if the event is a configuration mutation,
 * otherwise returns the previous index directly in O(1) time.
 */
export function incrementalUpdateIndexes(
  previousIndexes: GraphIndexes,
  event: GraphEvent,
  graph: Graph,
): GraphIndexes {
  if (isConfigEvent(event, graph)) {
    return buildGraphIndexes(graph);
  }
  return previousIndexes;
}

function collectNeighbours(
  adjacency: ReadonlyMap<NodeId, ReadonlyMap<TypeId, ReadonlySet<NodeId>>>,
  nodeId: NodeId,
  edgeType: TypeId | undefined,
): ReadonlySet<NodeId> {
  const byEdgeType = adjacency.get(nodeId);
  if (!byEdgeType) return new Set();
  if (edgeType !== undefined) return byEdgeType.get(edgeType) ?? new Set();

  const combined = new Set<NodeId>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const bucket of byEdgeType.values()) {
    // eslint-disable-next-line functional/no-loop-statements
    for (const id of bucket) {
      // eslint-disable-next-line functional/immutable-data
      combined.add(id);
    }
  }
  return combined;
}

/**
 * Creates a `ReadModelPort` backed by this graph's `GraphIndexes` (lazily built and cached via
 * `getGraphIndexes`). Until O(delta) incremental maintenance lands (a follow-on change), the
 * returned port is only guaranteed accurate for a `graph` that has not since had events merged
 * into it -- see the `GraphIndexes` doc comment. `tryExecutePipeline` is intentionally omitted:
 * no push-down implementation exists yet.
 */
export function createIndexedReadModel(graph: Graph): ReadModelPort {
  return {
    typedNodeIds: (type) => getGraphIndexes(graph).typeIndex.get(type) ?? new Set(),
    neighbours: (nodeId, edgeType, direction) => {
      const indexes = getGraphIndexes(graph);
      if (direction === 'out') return collectNeighbours(indexes.adjacencyOut, nodeId, edgeType);
      if (direction === 'in') return collectNeighbours(indexes.adjacencyIn, nodeId, edgeType);
      const out = collectNeighbours(indexes.adjacencyOut, nodeId, edgeType);
      const inbound = collectNeighbours(indexes.adjacencyIn, nodeId, edgeType);
      // Set#union/#intersection (ES2025) are unavailable under this project's "ES2024" tsconfig
      // lib target -- see tsconfig.base.json.
      // eslint-disable-next-line unicorn/prefer-set-methods
      return new Set([...out, ...inbound]);
    },
    nodesWhereEquals: (property, value, type) => {
      if (!isScalarValue(value)) return new Set(); // arrays are never indexed
      const indexes = getGraphIndexes(graph);
      const matches = indexes.propertyEquality.get(property)?.get(serializeScalarForIndex(value));
      if (!matches) return new Set();
      if (type === undefined) return matches;
      const typed = indexes.typeIndex.get(type) ?? new Set();
      // eslint-disable-next-line unicorn/prefer-set-methods -- Set#intersection is ES2025, see above
      return new Set([...matches].filter((id) => typed.has(id)));
    },
  };
}
