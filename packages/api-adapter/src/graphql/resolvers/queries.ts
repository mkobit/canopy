import { SYSTEM_EDGE_TYPES, SYSTEM_IDS, asNodeId, asTypeId } from '@canopy/graph';
import type { ApiAdapterContext } from '../../api-context';
import { executeQuery } from '../../query-handlers';
import { buildConnection, decodeCursor } from '../connection';

const createNodeQueryResolvers = (context: ApiAdapterContext) => ({
  node: (_parent: unknown, arguments_: Readonly<{ id: string }>) => {
    const result = executeQuery.getNode(context, asNodeId(arguments_.id));
    return result.ok ? result.value : null;
  },

  nodes: (
    _parent: unknown,
    arguments_: Readonly<{
      type?: string | undefined;
      first?: number | undefined;
      after?: string | undefined;
    }>,
  ) => {
    const offset = arguments_.after ? decodeCursor(arguments_.after) + 1 : 0;
    const limit = Math.min(arguments_.first ?? 50, 100);
    const typeId = arguments_.type ? asTypeId(arguments_.type) : undefined;
    const result = executeQuery.getNodes(context, { type: typeId });
    if (!result.ok) {
      return buildConnection([], 0, 0);
    }
    const all = result.value;
    const slice = all.slice(offset, offset + limit);
    return buildConnection(slice, offset, all.length);
  },

  edges: (
    _parent: unknown,
    arguments_: Readonly<{
      source?: string | undefined;
      target?: string | undefined;
      type?: string | undefined;
      first?: number | undefined;
      after?: string | undefined;
    }>,
  ) => {
    const offset = arguments_.after ? decodeCursor(arguments_.after) + 1 : 0;
    const limit = Math.min(arguments_.first ?? 50, 100);
    const result = executeQuery.getEdges(context, {
      source: arguments_.source ? asNodeId(arguments_.source) : undefined,
      target: arguments_.target ? asNodeId(arguments_.target) : undefined,
      type: arguments_.type ? asTypeId(arguments_.type) : undefined,
    });
    if (!result.ok) {
      return buildConnection([], 0, 0, true);
    }
    const all = result.value;
    const slice = all.slice(offset, offset + limit);
    return buildConnection(slice, offset, all.length, true);
  },

  traversal: (
    _parent: unknown,
    arguments_: Readonly<{
      startNodeIds: readonly string[];
      edgeType?: string | undefined;
      maxDepth?: number | undefined;
      maxNodes?: number | undefined;
      maxEdges?: number | undefined;
    }>,
  ) => {
    const startNodeIds = arguments_.startNodeIds.map(asNodeId);
    const edgeType = arguments_.edgeType ? asTypeId(arguments_.edgeType) : undefined;
    const result = executeQuery.traverse(context, {
      startNodeIds,
      edgeType,
      maxDepth: arguments_.maxDepth ?? 5,
    });
    if (!result.ok) {
      return { nodes: [], edges: [], truncated: false };
    }
    const maxNodes = arguments_.maxNodes ?? 500;
    const maxEdges = arguments_.maxEdges ?? 1000;
    const nodes = result.value.nodes.slice(0, maxNodes);
    const edges = result.value.edges.slice(0, maxEdges);
    const truncated = result.value.nodes.length > maxNodes || result.value.edges.length > maxEdges;
    return { nodes, edges, truncated };
  },

  gqlQuery: (
    _parent: unknown,
    arguments_: Readonly<{
      query: string;
      first?: number | undefined;
      after?: string | undefined;
    }>,
  ) => {
    const offset = arguments_.after ? decodeCursor(arguments_.after) + 1 : 0;
    const limit = Math.min(arguments_.first ?? 50, 100);
    const result = executeQuery.getNodes(context, {});
    if (!result.ok) {
      return buildConnection([], 0, 0);
    }
    const slice = result.value.slice(offset, offset + limit);
    return buildConnection(slice, offset, result.value.length);
  },
});

const createMetadataQueryResolvers = () => ({
  nodeTypes: () => {
    return Object.entries(SYSTEM_IDS)
      .filter(([key]) => key.startsWith('TYPE_') || key.endsWith('_TYPE'))
      .map(([name, id]) => ({
        id,
        name,
        description: `System node type ${name}`,
        properties: [],
      }));
  },

  nodeType: (_parent: unknown, arguments_: Readonly<{ id: string }>) => {
    return {
      id: arguments_.id,
      name: arguments_.id,
      description: `Node type ${arguments_.id}`,
      properties: [],
    };
  },

  edgeTypes: () => {
    return Object.entries(SYSTEM_EDGE_TYPES).map(([name, id]) => ({
      id,
      name,
      description: `System edge type ${name}`,
    }));
  },

  edgeType: (_parent: unknown, arguments_: Readonly<{ id: string }>) => {
    return { id: arguments_.id, name: arguments_.id, description: `Edge type ${arguments_.id}` };
  },

  systemIds: () => ({
    nodeTypes: Object.values(SYSTEM_IDS),
    edgeTypes: Object.values(SYSTEM_EDGE_TYPES),
    namespaces: [
      SYSTEM_IDS.NAMESPACE_SYSTEM,
      SYSTEM_IDS.NAMESPACE_USER,
      SYSTEM_IDS.NAMESPACE_IMPORTED,
    ],
  }),
});

export const createQueryResolvers = (context: ApiAdapterContext) => ({
  ...createNodeQueryResolvers(context),
  ...createMetadataQueryResolvers(),
});
