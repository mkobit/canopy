import type { NodeId, TypeId } from './identifiers';
import type { Node } from './node';
import type { Edge } from './edge';
import type { PropertyValue } from './properties';
import type { ScalarValue } from './scalars';
import type { Graph } from './graph';
import type { GraphEvent } from './events';
import type { ReadModelPort } from './read-model';
import type { Result } from './result';
import { fromThrowable, ok, err as error } from './result';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from './system';
import { asTypeId } from './factories';

/**
 * Pre-computed settings, view, and read-model indexes for O(1)/O(delta) lookup.
 *
 * `typeIndex`, `adjacencyOut`, `adjacencyIn`, and `propertyEquality` back the `ReadModelPort`
 * (see `read-model.ts` and `createIndexedReadModel` below). They are populated by a full scan in
 * `buildGraphIndexes`, and kept correct across incremental merges by `incrementalUpdateIndexes`
 * (O(delta) per event -- see `updateReadModelIndexesForEvent`), called from both
 * `applyOneEvent` (`incremental-projection.ts`) and `applyEvent` (`projection.ts`) whenever
 * `graph._indexes` is already populated. No executor consumes them yet -- that's a separate,
 * follow-on change.
 */
export interface GraphIndexes {
  readonly settingsSchemas: ReadonlyMap<string, Node>; // key -> SettingsSchema node
  readonly userSettings: ReadonlyMap<string, PropertyValue>; // schemaNodeId\0scopeType\0scopeTarget -> parsed value (deeply frozen)
  readonly viewOverrides: ReadonlyMap<NodeId, Node>; // nodeId -> ViewDefinition node
  readonly defaultViews: ReadonlyMap<TypeId, Node>; // typeId -> ViewDefinition node
  readonly typeIndex: ReadonlyMap<TypeId, ReadonlySet<NodeId>>; // typeId -> node IDs of that type
  // nodeId -> edgeType -> (neighbour node ID -> number of edges of that type/direction contributing
  // that neighbour). Counted, not a plain Set: parallel edges (including self-loops) between the
  // same pair can independently come and go, so a neighbour must stay present until every
  // contributing edge is gone, not just the most recently deleted one.
  readonly adjacencyOut: ReadonlyMap<NodeId, ReadonlyMap<TypeId, ReadonlyMap<NodeId, number>>>;
  readonly adjacencyIn: ReadonlyMap<NodeId, ReadonlyMap<TypeId, ReadonlyMap<NodeId, number>>>;
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

/**
 * Increments `adjacency[nodeId][edgeType][neighbourId]`'s edge count, creating buckets as needed.
 * A count (not a plain Set) because parallel edges between the same pair must each contribute
 * independently -- see the `GraphIndexes.adjacencyOut` doc comment.
 */
function addNeighbour(
  // eslint-disable-next-line functional/prefer-immutable-types
  adjacency: Map<NodeId, Map<TypeId, Map<NodeId, number>>>,
  nodeId: NodeId,
  edgeType: TypeId,
  neighbourId: NodeId,
  // eslint-disable-next-line functional/no-return-void
): void {
  const byEdgeType = adjacency.get(nodeId) ?? new Map<TypeId, Map<NodeId, number>>();
  const bucket = byEdgeType.get(edgeType) ?? new Map<NodeId, number>();
  // eslint-disable-next-line functional/immutable-data
  bucket.set(neighbourId, (bucket.get(neighbourId) ?? 0) + 1);
  // eslint-disable-next-line functional/immutable-data
  byEdgeType.set(edgeType, bucket);
  // eslint-disable-next-line functional/immutable-data
  adjacency.set(nodeId, byEdgeType);
}

/** Immutably adds `value` under `map[key]`, copying only the touched bucket and outer map. */
function addToSet<K>(
  map: ReadonlyMap<K, ReadonlySet<NodeId>>,
  key: K,
  value: NodeId,
): ReadonlyMap<K, ReadonlySet<NodeId>> {
  const bucket = new Set(map.get(key));
  // eslint-disable-next-line functional/immutable-data
  bucket.add(value);
  const nextMap = new Map(map);
  // eslint-disable-next-line functional/immutable-data
  nextMap.set(key, bucket);
  return nextMap;
}

/** Immutably removes `value` from `map[key]`, dropping the bucket/key if it becomes empty. */
function removeFromSet<K>(
  map: ReadonlyMap<K, ReadonlySet<NodeId>>,
  key: K,
  value: NodeId,
): ReadonlyMap<K, ReadonlySet<NodeId>> {
  const bucket = map.get(key);
  if (!bucket || !bucket.has(value)) return map;
  const nextBucket = new Set(bucket);
  // eslint-disable-next-line functional/immutable-data
  nextBucket.delete(value);
  const nextMap = new Map(map);
  if (nextBucket.size === 0) {
    // eslint-disable-next-line functional/immutable-data
    nextMap.delete(key);
  } else {
    // eslint-disable-next-line functional/immutable-data
    nextMap.set(key, nextBucket);
  }
  return nextMap;
}

/** Immutably adds `value` under `map[key1][key2]`, copying only the touched path. */
function addToNestedSet<K1, K2>(
  map: ReadonlyMap<K1, ReadonlyMap<K2, ReadonlySet<NodeId>>>,
  key1: K1,
  key2: K2,
  value: NodeId,
): ReadonlyMap<K1, ReadonlyMap<K2, ReadonlySet<NodeId>>> {
  const inner = map.get(key1) ?? new Map<K2, ReadonlySet<NodeId>>();
  const nextInner = addToSet(inner, key2, value);
  const nextMap = new Map(map);
  // eslint-disable-next-line functional/immutable-data
  nextMap.set(key1, nextInner);
  return nextMap;
}

/**
 * Immutably removes `value` from `map[key1][key2]`, dropping empty buckets/keys at both levels.
 */
function removeFromNestedSet<K1, K2>(
  map: ReadonlyMap<K1, ReadonlyMap<K2, ReadonlySet<NodeId>>>,
  key1: K1,
  key2: K2,
  value: NodeId,
): ReadonlyMap<K1, ReadonlyMap<K2, ReadonlySet<NodeId>>> {
  const inner = map.get(key1);
  if (!inner) return map;
  const nextInner = removeFromSet(inner, key2, value);
  if (nextInner === inner) return map;
  const nextMap = new Map(map);
  if (nextInner.size === 0) {
    // eslint-disable-next-line functional/immutable-data
    nextMap.delete(key1);
  } else {
    // eslint-disable-next-line functional/immutable-data
    nextMap.set(key1, nextInner);
  }
  return nextMap;
}

/**
 * Immutably increments `map[key1][key2][neighbour]`'s count by one, copying only the touched path.
 * Used for adjacency, where multiple parallel edges can each independently contribute the same
 * neighbour -- see the `GraphIndexes.adjacencyOut` doc comment.
 */
function incrementNestedCount<K1, K2>(
  map: ReadonlyMap<K1, ReadonlyMap<K2, ReadonlyMap<NodeId, number>>>,
  key1: K1,
  key2: K2,
  neighbour: NodeId,
): ReadonlyMap<K1, ReadonlyMap<K2, ReadonlyMap<NodeId, number>>> {
  const inner = map.get(key1) ?? new Map<K2, ReadonlyMap<NodeId, number>>();
  const bucket = inner.get(key2) ?? new Map<NodeId, number>();
  const nextBucket = new Map(bucket);
  // eslint-disable-next-line functional/immutable-data
  nextBucket.set(neighbour, (nextBucket.get(neighbour) ?? 0) + 1);
  const nextInner = new Map(inner);
  // eslint-disable-next-line functional/immutable-data
  nextInner.set(key2, nextBucket);
  const nextMap = new Map(map);
  // eslint-disable-next-line functional/immutable-data
  nextMap.set(key1, nextInner);
  return nextMap;
}

/**
 * Immutably decrements `map[key1][key2][neighbour]`'s count by one, removing the neighbour and any
 * now-empty buckets/keys once the count reaches zero. Use this when exactly one contributing edge
 * is gone (`removeEdgeFromReadModelIndexes`); use `removeAllFromNestedCount` when every edge a
 * neighbour contributed is gone at once (node-deletion cascade).
 */
function decrementNestedCount<K1, K2>(
  map: ReadonlyMap<K1, ReadonlyMap<K2, ReadonlyMap<NodeId, number>>>,
  key1: K1,
  key2: K2,
  neighbour: NodeId,
): ReadonlyMap<K1, ReadonlyMap<K2, ReadonlyMap<NodeId, number>>> {
  const inner = map.get(key1);
  const bucket = inner?.get(key2);
  const count = bucket?.get(neighbour);
  if (!inner || !bucket || count === undefined) return map;
  const nextBucket = new Map(bucket);
  if (count <= 1) {
    // eslint-disable-next-line functional/immutable-data
    nextBucket.delete(neighbour);
  } else {
    // eslint-disable-next-line functional/immutable-data
    nextBucket.set(neighbour, count - 1);
  }
  const nextInner = new Map(inner);
  if (nextBucket.size === 0) {
    // eslint-disable-next-line functional/immutable-data
    nextInner.delete(key2);
  } else {
    // eslint-disable-next-line functional/immutable-data
    nextInner.set(key2, nextBucket);
  }
  const nextMap = new Map(map);
  if (nextInner.size === 0) {
    // eslint-disable-next-line functional/immutable-data
    nextMap.delete(key1);
  } else {
    // eslint-disable-next-line functional/immutable-data
    nextMap.set(key1, nextInner);
  }
  return nextMap;
}

/**
 * Immutably removes `map[key1][key2][neighbour]` entirely, regardless of its current count. Used
 * when cascading a node deletion: every edge that node contributed to a neighbour relationship is
 * gone at once, not just one of several, so the whole entry -- not one count -- must go.
 */
function removeAllFromNestedCount<K1, K2>(
  map: ReadonlyMap<K1, ReadonlyMap<K2, ReadonlyMap<NodeId, number>>>,
  key1: K1,
  key2: K2,
  neighbour: NodeId,
): ReadonlyMap<K1, ReadonlyMap<K2, ReadonlyMap<NodeId, number>>> {
  const inner = map.get(key1);
  const bucket = inner?.get(key2);
  if (!inner || !bucket || !bucket.has(neighbour)) return map;
  const nextBucket = new Map(bucket);
  // eslint-disable-next-line functional/immutable-data
  nextBucket.delete(neighbour);
  const nextInner = new Map(inner);
  if (nextBucket.size === 0) {
    // eslint-disable-next-line functional/immutable-data
    nextInner.delete(key2);
  } else {
    // eslint-disable-next-line functional/immutable-data
    nextInner.set(key2, nextBucket);
  }
  const nextMap = new Map(map);
  if (nextInner.size === 0) {
    // eslint-disable-next-line functional/immutable-data
    nextMap.delete(key1);
  } else {
    // eslint-disable-next-line functional/immutable-data
    nextMap.set(key1, nextInner);
  }
  return nextMap;
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
  const adjacencyOut = new Map<NodeId, Map<TypeId, Map<NodeId, number>>>();
  const adjacencyIn = new Map<NodeId, Map<TypeId, Map<NodeId, number>>>();

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
 *
 * Checks `graph._indexes` before falling back to a full rebuild: every graph produced by a merge
 * that started from an already-indexed graph carries incrementally-maintained indexes on this
 * field (see `incrementalUpdateIndexes`), even though it's a new object the `graphCache` WeakMap
 * has never seen. Skipping this check would silently discard that O(delta) maintenance and force
 * a full O(V+E) rebuild on the first read of every new graph snapshot.
 */
export function getGraphIndexes(graph: Graph): GraphIndexes {
  const cached = graphCache.get(graph);
  if (cached) {
    return cached;
  }
  if (graph._indexes) {
    graphCache.set(graph, graph._indexes);
    return graph._indexes;
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

/** Adds a newly-created node's type and scalar properties to the read-model indexes. */
function addNodeToReadModelIndexes(indexes: GraphIndexes, node: Node): GraphIndexes {
  const typeIndex = addToSet(indexes.typeIndex, node.type, node.id);
  // eslint-disable-next-line functional/no-let -- accumulates copy-on-write updates across a small, bounded property loop
  let propertyEquality = indexes.propertyEquality;
  // eslint-disable-next-line functional/no-loop-statements
  for (const [property, value] of node.properties) {
    if (isScalarValue(value)) {
      propertyEquality = addToNestedSet(
        propertyEquality,
        property,
        serializeScalarForIndex(value),
        node.id,
      );
    }
  }
  return { ...indexes, typeIndex, propertyEquality };
}

/**
 * Removes a deleted node's type and scalar properties from the read-model indexes, and cascades
 * to every adjacency entry (both directions) touching it -- driven by the read-model's own prior
 * adjacency state, not by re-deriving which edges were removed from the event.
 */
function removeNodeFromReadModelIndexes(indexes: GraphIndexes, node: Node): GraphIndexes {
  const typeIndex = removeFromSet(indexes.typeIndex, node.type, node.id);
  // eslint-disable-next-line functional/no-let -- accumulates copy-on-write updates across a small, bounded property loop
  let propertyEquality = indexes.propertyEquality;
  // eslint-disable-next-line functional/no-loop-statements
  for (const [property, value] of node.properties) {
    if (isScalarValue(value)) {
      propertyEquality = removeFromNestedSet(
        propertyEquality,
        property,
        serializeScalarForIndex(value),
        node.id,
      );
    }
  }

  // eslint-disable-next-line functional/no-let -- accumulates copy-on-write updates across this node's (bounded) degree
  let adjacencyOut = indexes.adjacencyOut;
  // eslint-disable-next-line functional/no-let
  let adjacencyIn = indexes.adjacencyIn;
  const outBuckets =
    indexes.adjacencyOut.get(node.id) ?? new Map<TypeId, ReadonlyMap<NodeId, number>>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [edgeType, targets] of outBuckets) {
    // eslint-disable-next-line functional/no-loop-statements
    for (const target of targets.keys()) {
      adjacencyIn = removeAllFromNestedCount(adjacencyIn, target, edgeType, node.id);
    }
  }
  const inBuckets =
    indexes.adjacencyIn.get(node.id) ?? new Map<TypeId, ReadonlyMap<NodeId, number>>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [edgeType, sources] of inBuckets) {
    // eslint-disable-next-line functional/no-loop-statements
    for (const source of sources.keys()) {
      adjacencyOut = removeAllFromNestedCount(adjacencyOut, source, edgeType, node.id);
    }
  }
  const finalAdjacencyOut = new Map(adjacencyOut);
  // eslint-disable-next-line functional/immutable-data
  finalAdjacencyOut.delete(node.id);
  const finalAdjacencyIn = new Map(adjacencyIn);
  // eslint-disable-next-line functional/immutable-data
  finalAdjacencyIn.delete(node.id);

  return {
    ...indexes,
    typeIndex,
    propertyEquality,
    adjacencyOut: finalAdjacencyOut,
    adjacencyIn: finalAdjacencyIn,
  };
}

/** Adds a newly-created edge's adjacency entries (incrementing, not just setting) in both directions. */
function addEdgeToReadModelIndexes(indexes: GraphIndexes, edge: Edge): GraphIndexes {
  return {
    ...indexes,
    adjacencyOut: incrementNestedCount(indexes.adjacencyOut, edge.source, edge.type, edge.target),
    adjacencyIn: incrementNestedCount(indexes.adjacencyIn, edge.target, edge.type, edge.source),
  };
}

/**
 * Removes a deleted edge's adjacency entries (decrementing, not unconditionally clearing) in both
 * directions -- a parallel edge to the same neighbour, if any, keeps that neighbour present.
 */
function removeEdgeFromReadModelIndexes(indexes: GraphIndexes, edge: Edge): GraphIndexes {
  return {
    ...indexes,
    adjacencyOut: decrementNestedCount(indexes.adjacencyOut, edge.source, edge.type, edge.target),
    adjacencyIn: decrementNestedCount(indexes.adjacencyIn, edge.target, edge.type, edge.source),
  };
}

/**
 * Moves a node's changed scalar properties between property-equality buckets by diffing the
 * before/after graph state for each changed key -- correct regardless of per-property LWW
 * granularity, since a key whose write lost is unchanged between `previousNode`/`nextNode` and is
 * naturally skipped.
 */
function updateNodePropertiesInReadModelIndexes(
  indexes: GraphIndexes,
  changes: ReadonlyMap<string, PropertyValue>,
  previousNode: Node,
  nextNode: Node,
): GraphIndexes {
  // eslint-disable-next-line functional/no-let -- accumulates copy-on-write updates across a small, bounded set of changed keys
  let propertyEquality = indexes.propertyEquality;
  // eslint-disable-next-line functional/no-loop-statements
  for (const property of changes.keys()) {
    const oldValue = previousNode.properties.get(property);
    const newValue = nextNode.properties.get(property);
    const oldKey = oldValue !== undefined && isScalarValue(oldValue) ? oldValue : undefined;
    const newKey = newValue !== undefined && isScalarValue(newValue) ? newValue : undefined;
    const oldSerialized = oldKey === undefined ? undefined : serializeScalarForIndex(oldKey);
    const newSerialized = newKey === undefined ? undefined : serializeScalarForIndex(newKey);
    if (oldSerialized === newSerialized) continue; // unchanged, or this key's write lost LWW

    if (oldSerialized !== undefined) {
      propertyEquality = removeFromNestedSet(
        propertyEquality,
        property,
        oldSerialized,
        previousNode.id,
      );
    }
    if (newSerialized !== undefined) {
      propertyEquality = addToNestedSet(propertyEquality, property, newSerialized, nextNode.id);
    }
  }
  return { ...indexes, propertyEquality };
}

/** Dispatches O(delta) read-model index maintenance for one applied (non-no-op, non-config) event. */
function updateReadModelIndexesForEvent(
  indexes: GraphIndexes,
  event: GraphEvent,
  previousGraph: Graph,
  nextGraph: Graph,
): GraphIndexes {
  switch (event.type) {
    case 'NodeCreated': {
      const node = nextGraph.nodes.get(event.id);
      return node ? addNodeToReadModelIndexes(indexes, node) : indexes;
    }
    case 'NodeDeleted': {
      const node = previousGraph.nodes.get(event.id);
      return node ? removeNodeFromReadModelIndexes(indexes, node) : indexes;
    }
    case 'EdgeCreated': {
      const edge = nextGraph.edges.get(event.id);
      return edge ? addEdgeToReadModelIndexes(indexes, edge) : indexes;
    }
    case 'EdgeDeleted': {
      const edge = previousGraph.edges.get(event.id);
      return edge ? removeEdgeFromReadModelIndexes(indexes, edge) : indexes;
    }
    case 'NodePropertiesUpdated': {
      const previousNode = previousGraph.nodes.get(event.id);
      const nextNode = nextGraph.nodes.get(event.id);
      return previousNode && nextNode
        ? updateNodePropertiesInReadModelIndexes(indexes, event.changes, previousNode, nextNode)
        : indexes;
    }
    case 'EdgePropertiesUpdated': {
      // Edge properties aren't part of any read-model index (only type/source/target/adjacency
      // are, and those are immutable on an edge).
      return indexes;
    }
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return indexes; // no graph-shape change
    }
  }
}

/**
 * Incrementally updates the read model and config (settings/view) indexes for one applied event.
 * Config-mutating events still trigger a full rebuild (unchanged, rare); everything else is O(delta)
 * against the read-model indexes (type/adjacency/property-equality), or an O(1) passthrough for a
 * no-op event (detected via `previousGraph === nextGraph` reference equality -- every no-op branch
 * in `applyEvent`/`applyOneEventInternal` returns the input graph unchanged).
 */
export function incrementalUpdateIndexes(
  previousIndexes: GraphIndexes,
  event: GraphEvent,
  previousGraph: Graph,
  nextGraph: Graph,
): GraphIndexes {
  if (isConfigEvent(event, nextGraph)) {
    return buildGraphIndexes(nextGraph);
  }
  if (previousGraph === nextGraph) {
    return previousIndexes;
  }
  return updateReadModelIndexesForEvent(previousIndexes, event, previousGraph, nextGraph);
}

function collectNeighbours(
  adjacency: ReadonlyMap<NodeId, ReadonlyMap<TypeId, ReadonlyMap<NodeId, number>>>,
  nodeId: NodeId,
  edgeType: TypeId | undefined,
): ReadonlySet<NodeId> {
  const byEdgeType = adjacency.get(nodeId);
  if (!byEdgeType) return new Set();
  if (edgeType !== undefined) return new Set(byEdgeType.get(edgeType)?.keys());

  const combined = new Set<NodeId>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const bucket of byEdgeType.values()) {
    // eslint-disable-next-line functional/no-loop-statements
    for (const id of bucket.keys()) {
      // eslint-disable-next-line functional/immutable-data
      combined.add(id);
    }
  }
  return combined;
}

/**
 * Creates a `ReadModelPort` backed by this graph's `GraphIndexes` (lazily built and cached via
 * `getGraphIndexes`, which reuses `graph._indexes` when a prior merge already maintained it
 * incrementally). `tryExecutePipeline` is intentionally omitted: no push-down implementation
 * exists yet.
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

/**
 * Canonicalizes the read-model portion of `GraphIndexes` into a JSON string with sorted keys, so
 * two independently-constructed index sets (e.g. incrementally-maintained vs from-scratch) can be
 * compared for equal content regardless of Map/Set insertion order.
 */
function canonicalizeReadModelIndexes(indexes: GraphIndexes): string {
  const canonicalizeValue = (value: unknown): unknown => {
    if (value instanceof Map) {
      return [...value]
        .toSorted(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([key, nested]) => [key, canonicalizeValue(nested)]);
    }
    if (value instanceof Set) {
      return [...value].map(String).toSorted((a, b) => a.localeCompare(b));
    }
    return value;
  };
  return JSON.stringify(
    canonicalizeValue(
      new Map<string, unknown>([
        ['typeIndex', indexes.typeIndex],
        ['adjacencyOut', indexes.adjacencyOut],
        ['adjacencyIn', indexes.adjacencyIn],
        ['propertyEquality', indexes.propertyEquality],
      ]),
    ),
  );
}

/**
 * Dev-mode assertion: rebuilds the read-model indexes for `graph` from scratch and compares them
 * against `graph._indexes` (presumed incrementally-maintained), returning an error describing the
 * divergence if they disagree. Intended for use in tests and debug assertions, not the hot path.
 */
export function verifyIndexes(graph: Graph): Result<void, Error> {
  const current = graph._indexes;
  if (!current) {
    return error(
      new Error('verifyIndexes: graph has no _indexes to verify (call getGraphIndexes first)'),
    );
  }
  const rebuilt = buildGraphIndexes(graph);
  if (canonicalizeReadModelIndexes(current) !== canonicalizeReadModelIndexes(rebuilt)) {
    return error(
      new Error(
        'verifyIndexes: incrementally-maintained read-model indexes diverged from a from-scratch rebuild',
      ),
    );
  }
  return ok(undefined);
}
