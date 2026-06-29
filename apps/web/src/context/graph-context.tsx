import { asDeviceId } from '@canopy/graph';
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createSyncEngine, type SyncEngine } from '@canopy/sync';
import type {
  Graph,
  GraphId,
  NodeId,
  EdgeId,
  PropertyValue,
  Node,
  Edge,
  Result,
} from '@canopy/graph';
import { asInstant, ok, err, fromThrowable, fromAsyncThrowable } from '@canopy/graph';
import { useStorage } from './storage-context';
import { z } from 'zod';
import { TypeIdSchema, PropertyValueSchema } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';

interface GraphContextState {
  readonly graph: Graph | null;
  readonly syncEngine: SyncEngine | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

interface GraphContextActions {
  readonly loadGraph: (graphId: GraphId) => Promise<Result<void, Error>>;
  readonly closeGraph: () => Result<void, Error>;
  readonly saveGraph: () => Promise<Result<void, Error>>;
  readonly createNode: (
    type: string,
    properties?: Record<string, unknown>,
  ) => Promise<Result<NodeId, Error>>;
  readonly createEdge: (
    type: string,
    source: NodeId,
    target: NodeId,
    properties?: Record<string, unknown>,
  ) => Promise<Result<EdgeId, Error>>;
}

type GraphContextType = GraphContextState & GraphContextActions;

const CreateNodeInputSchema = z.object({
  type: TypeIdSchema,
  properties: z.record(z.string(), PropertyValueSchema).optional(),
});

const CreateEdgeInputSchema = z.object({
  type: TypeIdSchema,
  source: z.string(),
  target: z.string(),
  properties: z.record(z.string(), PropertyValueSchema).optional(),
});

const GraphContext = createContext<GraphContextType>({
  graph: null,
  syncEngine: null,
  isLoading: false,
  error: null,
  loadGraph: async () => ok(undefined),
  closeGraph: () => ok(undefined),
  saveGraph: async () => ok(undefined),
  createNode: async () => err(new Error('Not initialized')),
  createEdge: async () => err(new Error('Not initialized')),
});

// eslint-disable-next-line max-lines-per-function
export const GraphProvider: React.FC<Readonly<{ children: React.ReactNode }>> = ({ children }) => {
  const { storage } = useStorage();
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  const syncEngineRef = useRef<SyncEngine | null>(null); // Ref to avoid dependency cycles

  const [graph, setGraph] = useState<Graph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentGraphId, setCurrentGraphId] = useState<GraphId | null>(null);

  const updateGraphFromStore = (engine: SyncEngine, graphId: GraphId, name?: string) => {
    const nodes = new Map<NodeId, Node>(
      [...engine.store.getAllNodes()].map((node) => [node.id, node]),
    );
    const edges = new Map<EdgeId, Edge>(
      [...engine.store.getAllEdges()].map((edge) => [edge.id, edge]),
    );

    const now = asInstant(Temporal.Now.instant().toString());
    setGraph((prevGraph) => {
      const activeName = name ?? prevGraph?.name ?? 'Graph';
      return {
        id: graphId,
        name: activeName,
        metadata: {
          created: now,
          modified: now,
          modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
        }, // Placeholder
        nodes,
        edges,
      };
    });
    return undefined;
  };

  const loadGraph = useCallback(
    async (graphId: GraphId): Promise<Result<void, Error>> => {
      if (!storage) return err(new Error('Storage not available'));

      setIsLoading(true);
      setError(null);

      const result = await fromAsyncThrowable(async () => {
        // Clean up previous engine if exists
        if (syncEngineRef.current) {
          syncEngineRef.current.disconnectProvider();
        }

        // 1. Load snapshot from storage
        const snapshotResult = await storage.load(graphId);

        if (!snapshotResult.ok) throw snapshotResult.error;
        const snapshot = snapshotResult.value;

        // Load graph name from metadata list
        const listResult = await storage.list();
        const matchedMeta = listResult.ok
          ? listResult.value.find((g) => g.id === graphId)
          : undefined;
        const graphName = matchedMeta?.name ?? 'Graph';

        // 2. Initialize SyncEngine
        // If snapshot is undefined (new graph), we pass undefined, SyncEngine creates new Doc.
        const engine = createSyncEngine(snapshot ? { initialSnapshot: snapshot } : {});

        setSyncEngine(engine);
        syncEngineRef.current = engine;
        setCurrentGraphId(graphId);

        // Initial graph state
        updateGraphFromStore(engine, graphId, graphName);

        // Subscribe to updates
        engine.doc.on('update', () => {
          updateGraphFromStore(engine, graphId, graphName);
          return undefined;
        });

        return undefined;
      });

      if (!result.ok) {
        console.error('Failed to load graph:', result.error);
        setError(result.error);
      }

      setIsLoading(false);
      return result;
    },
    [storage],
  ); // Removed syncEngine from dependency

  const closeGraph = useCallback((): Result<void, Error> => {
    return fromThrowable(() => {
      if (syncEngineRef.current) {
        syncEngineRef.current.disconnectProvider();
        setSyncEngine(null);
        syncEngineRef.current = null;
      }
      setGraph(null);
      setCurrentGraphId(null);
      return undefined;
    });
  }, []);

  const saveGraph = useCallback(async (): Promise<Result<void, Error>> => {
    if (syncEngineRef.current && storage && currentGraphId && graph) {
      const syncEngine = syncEngineRef.current;
      return fromAsyncThrowable(async () => {
        const snapshot = syncEngine.getSnapshot();
        const createdAt = graph.metadata.created || Temporal.Now.instant().toString();
        const result = await storage.save(currentGraphId, snapshot, {
          id: currentGraphId,
          name: graph.name,
          createdAt,
          updatedAt: Temporal.Now.instant().toString(),
        });

        if (!result.ok) throw result.error;
        return undefined;
      });
    }
    // If not loaded, effectively a no-op success or error?
    // Let's return error if called without graph
    if (!syncEngineRef.current || !currentGraphId) return err(new Error('No graph loaded'));
    if (!storage) return err(new Error('Storage not available'));

    return ok(undefined);
  }, [storage, currentGraphId, graph]);

  const createNode = useCallback(
    async (
      type: string,
      properties: Record<string, unknown> = {},
    ): Promise<Result<NodeId, Error>> => {
      if (!syncEngineRef.current) return err(new Error('SyncEngine not initialized'));
      const syncEngine = syncEngineRef.current;

      return fromAsyncThrowable(async () => {
        // Validate inputs
        const input = CreateNodeInputSchema.parse({ type, properties });

        const typeId = input.type;

        const propsMap = new Map<string, PropertyValue>(
          input.properties ? Object.entries(input.properties) : [],
        );

        const newNodeResult = syncEngine.store.addNode({
          type: typeId,
          properties: propsMap,
        });

        if (!newNodeResult.ok) throw newNodeResult.error;
        const newNode = newNodeResult.value;

        const saveResult = await saveGraph();

        if (!saveResult.ok) throw saveResult.error;

        return newNode.id;
      });
    },
    [saveGraph],
  );

  const createEdge = useCallback(
    async (
      type: string,
      source: NodeId,
      target: NodeId,
      properties: Record<string, unknown> = {},
    ): Promise<Result<EdgeId, Error>> => {
      if (!syncEngineRef.current) return err(new Error('SyncEngine not initialized'));
      const syncEngine = syncEngineRef.current;

      return fromAsyncThrowable(async () => {
        const input = CreateEdgeInputSchema.parse({ type, source, target, properties });
        const typeId = input.type;

        const propsMap = new Map<string, PropertyValue>(
          input.properties ? Object.entries(input.properties) : [],
        );

        const newEdgeResult = syncEngine.store.addEdge({
          type: typeId,
          source: source,
          target: target,
          properties: propsMap,
        });

        if (!newEdgeResult.ok) throw newEdgeResult.error;
        const newEdge = newEdgeResult.value;

        const saveResult = await saveGraph();
        if (!saveResult.ok) throw saveResult.error;

        return newEdge.id;
      });
    },
    [saveGraph],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncEngineRef.current) {
        syncEngineRef.current.disconnectProvider();
      }
      return undefined;
    };
  }, []);

  return (
    <GraphContext.Provider
      value={{
        graph,
        syncEngine,
        isLoading,
        error,
        loadGraph,
        closeGraph,
        saveGraph,
        createNode,
        createEdge,
      }}
    >
      {children}
    </GraphContext.Provider>
  );
};

export const useGraph = () => useContext(GraphContext);
