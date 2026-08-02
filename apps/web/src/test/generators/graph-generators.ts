import {
  asDeviceId,
  asEdgeId,
  asGraphId,
  asNodeId,
  asTypeId,
  createEventId,
  createGraph,
  createInstant,
  createGraphSession,
  unwrap,
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
  type DeviceId,
  type Edge,
  type Graph,
  type GraphEvent,
  type GraphSession,
  type Node,
  type NodeId,
  type EdgeId,
  type PropertyValue,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { generateNodePayload } from './node-generators';
import { generateSchemaPayload } from './schema-generators';
import { generateQueryPayload } from './query-generators';

export type GenerateVaultOptions = Readonly<{
  preset: 'demo' | 'large';
  seed?: number | undefined;
}>;

const SYSTEM_DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');

function createLcg(seed: number): () => number {
  // eslint-disable-next-line functional/no-let -- seedable LCG random number generator state
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function buildSchemaNodes(seed?: number): readonly Readonly<[NodeId, Node]>[] {
  const schemaPayload = generateSchemaPayload(seed === undefined ? {} : { seed });
  const nodeTypeEntries = schemaPayload.nodeTypes.map((nodeType): Readonly<[NodeId, Node]> => [
    nodeType.id,
    {
      id: nodeType.id,
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map<string, PropertyValue>([
        ['name', nodeType.name],
        ['namespace', nodeType.namespace],
        ['description', nodeType.description],
        ['properties', JSON.stringify(nodeType.properties)],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    },
  ]);

  const edgeTypeEntries = schemaPayload.edgeTypes.map((edgeType): Readonly<[NodeId, Node]> => [
    edgeType.id,
    {
      id: edgeType.id,
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: new Map<string, PropertyValue>([
        ['name', edgeType.name],
        ['namespace', edgeType.namespace],
        ['description', edgeType.description],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    },
  ]);

  return [...nodeTypeEntries, ...edgeTypeEntries];
}

function buildViewAndRendererNodes(): Readonly<{
  nodes: readonly Readonly<[NodeId, Node]>[];
  edges: readonly Readonly<[EdgeId, Edge]>[];
}> {
  const rendererNodeId = asNodeId('user:renderer:project-card');
  const emptyPermissions: readonly string[] = [];
  const rendererNode: Node = {
    id: rendererNodeId,
    type: SYSTEM_IDS.RENDERER,
    properties: new Map<string, PropertyValue>([
      ['name', 'Project Card Renderer'],
      ['description', 'Renders project overview cards via WASM component'],
      ['rendererKind', 'wasm'],
      ['entryPoint', 'plugin:project-card.wasm'],
      ['permissions', emptyPermissions],
      ['namespace', 'user'],
    ]),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
  };

  const viewNodeId = asNodeId('user:view:project-card');
  const viewNode: Node = {
    id: viewNodeId,
    type: SYSTEM_IDS.VIEW_DEFINITION,
    properties: new Map<string, PropertyValue>([
      ['name', 'Project Card View'],
      ['description', 'Default card layout view for project nodes'],
      ['layout', 'cards'],
      ['namespace', 'user'],
    ]),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
  };

  const usesRendererEdgeId = asEdgeId('user:edge:uses-renderer:project-card');
  const usesRendererEdge: Edge = {
    id: usesRendererEdgeId,
    type: SYSTEM_EDGE_TYPES.USES_RENDERER,
    source: viewNodeId,
    target: rendererNodeId,
    properties: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
  };

  const defaultViewEdgeId = asEdgeId('user:edge:default-view:project');
  const defaultViewEdge: Edge = {
    id: defaultViewEdgeId,
    type: SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
    source: asNodeId('user:node-type:project'),
    target: viewNodeId,
    properties: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
  };

  return {
    nodes: [
      [rendererNode.id, rendererNode],
      [viewNode.id, viewNode],
    ],
    edges: [
      [usesRendererEdge.id, usesRendererEdge],
      [defaultViewEdge.id, defaultViewEdge],
    ],
  };
}

function buildQueryNodes(seed?: number): readonly Readonly<[NodeId, Node]>[] {
  return Array.from({ length: 4 }, (_, index): Readonly<[NodeId, Node]> => {
    const queryPayload = generateQueryPayload(index, seed);
    const queryNode: Node = {
      id: queryPayload.id,
      type: SYSTEM_IDS.QUERY_DEFINITION,
      properties: new Map<string, PropertyValue>([
        ['name', queryPayload.name],
        ['description', queryPayload.description],
        ['definition', JSON.stringify(queryPayload.definition)],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    return [queryNode.id, queryNode];
  });
}

function buildContentNodes(count: number, seed?: number): readonly Readonly<[NodeId, Node]>[] {
  return Array.from({ length: count }, (_, index): Readonly<[NodeId, Node]> => {
    const payload = generateNodePayload(index, seed);
    const node: Node = {
      id: payload.id,
      type: payload.type,
      properties: new Map<string, PropertyValue>(Object.entries(payload.properties)),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    return [node.id, node];
  });
}

function buildContentEdges(
  edgeCount: number,
  nodeIds: readonly NodeId[],
  seed?: number,
): readonly Readonly<[EdgeId, Edge]>[] {
  if (nodeIds.length < 2) return [];
  const rng = seed === undefined ? undefined : createLcg(seed + 9999);
  const nextRandom = (): number => (rng ? rng() : Math.random());

  const edgeTypeIds: readonly string[] = [
    'user:edge-type:child-of',
    'user:edge-type:references',
    'user:edge-type:prerequisite',
  ];

  return Array.from({ length: edgeCount }, (_, index): Readonly<[EdgeId, Edge]> | undefined => {
    const sourceIndex = Math.floor(nextRandom() * nodeIds.length);
    const targetIndex = Math.floor(nextRandom() * nodeIds.length);
    if (sourceIndex === targetIndex) return undefined;

    const sourceId = nodeIds[sourceIndex % nodeIds.length];
    const targetId = nodeIds[targetIndex % nodeIds.length];
    if (!sourceId || !targetId) return undefined;

    const edgeTypeRaw = edgeTypeIds[index % edgeTypeIds.length] ?? 'user:edge-type:references';
    const edgeId = asEdgeId(`edge-seed-${index}`);

    const edge: Edge = {
      id: edgeId,
      type: asTypeId(edgeTypeRaw),
      source: sourceId,
      target: targetId,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    return [edge.id, edge];
  }).filter((entry): entry is Readonly<[EdgeId, Edge]> => entry !== undefined);
}

function graphToEvents(graph: Graph, deviceId: DeviceId): readonly GraphEvent[] {
  const nodeEvents: readonly GraphEvent[] = [...graph.nodes.values()].map((node) => ({
    type: 'NodeCreated',
    eventId: createEventId(),
    id: node.id,
    nodeType: node.type,
    properties: node.properties,
    timestamp: node.metadata.created,
    deviceId: node.metadata.modifiedBy ?? deviceId,
  }));

  const edgeEvents: readonly GraphEvent[] = [...graph.edges.values()].map((edge) => ({
    type: 'EdgeCreated',
    eventId: createEventId(),
    id: edge.id,
    edgeType: edge.type,
    source: edge.source,
    target: edge.target,
    properties: edge.properties,
    timestamp: edge.metadata.created,
    deviceId: edge.metadata.modifiedBy ?? deviceId,
  }));

  return [...nodeEvents, ...edgeEvents];
}

export function generateGraphVault(options: GenerateVaultOptions): Graph {
  const baseGraph = unwrap(createGraph(asGraphId('demo-graph'), 'demo-graph'));

  const seed = options.seed;
  const count = options.preset === 'large' ? 500 : 25;

  const schemaNodeEntries = buildSchemaNodes(seed);
  const viewAndRenderer = buildViewAndRendererNodes();
  const queryNodeEntries = buildQueryNodes(seed);
  const contentNodeEntries = buildContentNodes(count, seed);

  const generatedNodeIds = contentNodeEntries.map(([id]) => id);
  const edgeCount = options.preset === 'large' ? 1000 : 40;
  const contentEdgeEntries = buildContentEdges(edgeCount, generatedNodeIds, seed);

  const combinedNodesMap = new Map<NodeId, Node>([
    ...baseGraph.nodes,
    ...schemaNodeEntries,
    ...viewAndRenderer.nodes,
    ...queryNodeEntries,
    ...contentNodeEntries,
  ]);

  const combinedEdgesMap = new Map<EdgeId, Edge>([
    ...baseGraph.edges,
    ...viewAndRenderer.edges,
    ...contentEdgeEntries,
  ]);

  return {
    ...baseGraph,
    nodes: combinedNodesMap,
    edges: combinedEdgesMap,
  };
}

export function generateVault(options: GenerateVaultOptions): GraphSession {
  const graph = generateGraphVault(options);
  const store = createInMemoryEventStore();
  const graphId = asGraphId('demo-graph');
  const deviceId = asDeviceId('demo-device');
  const events = graphToEvents(graph, deviceId);
  void store.appendEvents('demo-graph', events);

  const session = createGraphSession(store, graphId, deviceId);
  void session.commit(events);

  return session;
}
