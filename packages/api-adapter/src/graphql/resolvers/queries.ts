import { SYSTEM_EDGE_TYPES, SYSTEM_IDS, asNodeId, asTypeId } from '@canopy/graph';
import type { ApiAdapterContext } from '../../api-context';
import { executeQuery } from '../../query-handlers';
import { buildConnection, decodeCursor } from '../connection';

const createNodeQueryResolvers = (context: ApiAdapterContext) => ({
  node: (_parent: unknown, args: Readonly<{ id: string }>) => {
    const result = executeQuery.getNode(context, asNodeId(args.id));
    return result.ok ? result.value : null;
  },

  nodes: (
    _parent: unknown,
    args: Readonly<{
      type?: string | undefined;
      first?: number | undefined;
      after?: string | undefined;
    }>,
  ) => {
    const offset = args.after ? decodeCursor(args.after) + 1 : 0;
    const limit = Math.min(args.first ?? 50, 100);
    const typeId = args.type ? asTypeId(args.type) : undefined;
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
    args: Readonly<{
      source?: string | undefined;
      target?: string | undefined;
      type?: string | undefined;
      first?: number | undefined;
      after?: string | undefined;
    }>,
  ) => {
    const offset = args.after ? decodeCursor(args.after) + 1 : 0;
    const limit = Math.min(args.first ?? 50, 100);
    const result = executeQuery.getEdges(context, {
      source: args.source ? asNodeId(args.source) : undefined,
      target: args.target ? asNodeId(args.target) : undefined,
      type: args.type ? asTypeId(args.type) : undefined,
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
    args: Readonly<{
      startNodeIds: readonly string[];
      edgeType?: string | undefined;
      maxDepth?: number | undefined;
      maxNodes?: number | undefined;
      maxEdges?: number | undefined;
    }>,
  ) => {
    const startNodeIds = args.startNodeIds.map(asNodeId);
    const edgeType = args.edgeType ? asTypeId(args.edgeType) : undefined;
    const result = executeQuery.traverse(context, {
      startNodeIds,
      edgeType,
      maxDepth: args.maxDepth ?? 5,
    });
    if (!result.ok) {
      return { nodes: [], edges: [], truncated: false };
    }
    const maxNodes = args.maxNodes ?? 500;
    const maxEdges = args.maxEdges ?? 1000;
    const nodes = result.value.nodes.slice(0, maxNodes);
    const edges = result.value.edges.slice(0, maxEdges);
    const truncated = result.value.nodes.length > maxNodes || result.value.edges.length > maxEdges;
    return { nodes, edges, truncated };
  },

  gqlQuery: (
    _parent: unknown,
    args: Readonly<{
      query: string;
      first?: number | undefined;
      after?: string | undefined;
    }>,
  ) => {
    const offset = args.after ? decodeCursor(args.after) + 1 : 0;
    const limit = Math.min(args.first ?? 50, 100);
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

  nodeType: (_parent: unknown, args: Readonly<{ id: string }>) => {
    return { id: args.id, name: args.id, description: `Node type ${args.id}`, properties: [] };
  },

  edgeTypes: () => {
    return Object.entries(SYSTEM_EDGE_TYPES).map(([name, id]) => ({
      id,
      name,
      description: `System edge type ${name}`,
    }));
  },

  edgeType: (_parent: unknown, args: Readonly<{ id: string }>) => {
    return { id: args.id, name: args.id, description: `Edge type ${args.id}` };
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
