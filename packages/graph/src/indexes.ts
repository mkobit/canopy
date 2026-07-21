import type { NodeId, TypeId } from './identifiers';
import type { Node } from './node';
import type { Edge } from './edge';
import type { PropertyValue } from './properties';
import type { Graph } from './graph';
import type { GraphEvent } from './events';
import { fromThrowable } from './result';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from './system';
import { asTypeId } from './factories';

/**
 * Pre-computed settings and view indexes for O(1) lookup.
 */
export interface GraphIndexes {
  readonly settingsSchemas: ReadonlyMap<string, Node>; // key -> SettingsSchema node
  readonly userSettings: ReadonlyMap<string, PropertyValue>; // schemaNodeId\0scopeType\0scopeTarget -> parsed value (deeply frozen)
  readonly viewOverrides: ReadonlyMap<NodeId, Node>; // nodeId -> ViewDefinition node
  readonly defaultViews: ReadonlyMap<TypeId, Node>; // typeId -> ViewDefinition node
}

/**
 * Recursively freezes an object to ensure absolute immutability of cached values.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // eslint-disable-next-line functional/no-loop-statements
  for (const val of Object.values(obj)) {
    deepFreeze(val);
  }
  return Object.freeze(obj);
}

/**
 * Builds the graph indexes from scratch using a single scan of the graph nodes and edges.
 */
// eslint-disable-next-line max-lines-per-function
export function buildGraphIndexes(graph: Graph): GraphIndexes {
  const settingsSchemas = new Map<string, Node>();
  const userSettings = new Map<string, PropertyValue>();

  // 1. Scan nodes for SettingsSchema and UserSetting
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
  }

  // 2. Scan edges for ViewOverride and DefaultView
  // eslint-disable-next-line functional/prefer-immutable-types
  const overrideEdges: Edge[] = [];
  // eslint-disable-next-line functional/prefer-immutable-types
  const defaultEdges: Edge[] = [];

  // eslint-disable-next-line functional/no-loop-statements
  for (const edge of graph.edges.values()) {
    if (edge.type === SYSTEM_EDGE_TYPES.VIEW_OVERRIDE) {
      // eslint-disable-next-line functional/immutable-data
      overrideEdges.push(edge);
    } else if (edge.type === SYSTEM_EDGE_TYPES.DEFAULT_VIEW) {
      // eslint-disable-next-line functional/immutable-data
      defaultEdges.push(edge);
    }
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
function isConfigurationEvent(event: GraphEvent, graph: Graph): boolean {
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
  prevIndexes: GraphIndexes,
  event: GraphEvent,
  graph: Graph,
): GraphIndexes {
  if (isConfigurationEvent(event, graph)) {
    return buildGraphIndexes(graph);
  }
  return prevIndexes;
}
