import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { SyncEngine } from '@canopy/sync';
import { Graph, GraphId, NodeId, EdgeId, asInstant, PropertyValue, Node, Edge, Result, ok, err, fromThrowable, fromAsyncThrowable } from '@canopy/types';
import { useStorage } from './StorageContext';
import { z } from 'zod';
import { asTypeId } from '@canopy/types';
// We don't import TypeIdSchema directly if it's not exported, but we can use asTypeId.
// Actually, I saw TypeIdSchema in packages/schema/src/schemas.ts but it was transforming string to TypeId.
// Let's import TypeIdSchema if possible, or just build a validator.
// I'll check exports again. packages/schema/src/index.ts exports * from schemas.
// The file reading showed `export const NodeTypeDefinitionSchema ...`.
// I didn't see `TypeIdSchema` explicitly exported in the `read_file` output but I might have missed it or it's implicitly used.
// Wait, I saw `type: z.string().min(1).transform(asTypeId)` inside NodeSchema.
// I can just use `asTypeId` with a simple Zod string validation.

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly createNode: (type: string, properties?: Record<string, any>) => Promise<Result<NodeId, Error>>;
}

type GraphContextType = GraphContextState & GraphContextActions;

const GraphContext = createContext<GraphContextType>({
  graph: null,
  syncEngine: null,
  isLoading: false,
  error: null,
  loadGraph: async () => ok(undefined),
  closeGraph: () => ok(undefined),
  saveGraph: async () => ok(undefined),
  createNode: async () => err(new Error("Not initialized")),
});

export const GraphProvider: React.FC<Readonly<{ children: React.ReactNode }>> = ({ children }) => {
  const { storage } = useStorage();
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  const syncEngineRef = useRef<SyncEngine | null>(null); // Ref to avoid dependency cycles

  const [graph, setGraph] = useState<Graph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentGraphId, setCurrentGraphId] = useState<GraphId | null>(null);

  const loadGraph = useCallback(async (graphId: GraphId): Promise<Result<void, Error>> => {
    if (!storage) return err(new Error("Storage not available"));

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

        // 2. Initialize SyncEngine
        // If snapshot is undefined (new graph), we pass undefined, SyncEngine creates new Doc.
        const engine = new SyncEngine(
            snapshot ? { initialSnapshot: snapshot } : {}
        );

        setSyncEngine(engine);
        syncEngineRef.current = engine;
        setCurrentGraphId(graphId);

        // Initial graph state
        updateGraphFromStore(engine, graphId);

        // Subscribe to updates
        engine.doc.on('update', () => {
             updateGraphFromStore(engine, graphId);
             return undefined;
        });

        return undefined;
    });

    if (!result.ok) {
        console.error("Failed to load graph:", result.error);
        setError(result.error);
    }

    setIsLoading(false);
    return result;

  }, [storage]); // Removed syncEngine from dependency

  const updateGraphFromStore = (engine: SyncEngine, graphId: GraphId) => {
      const nodes = new Map<NodeId, Node>(Array.from(engine.store.getAllNodes()).map(node => [node.id, node]));
      const edges = new Map<EdgeId, Edge>(Array.from(engine.store.getAllEdges()).map(edge => [edge.id, edge]));

      const now = asInstant(new Date().toISOString());
      setGraph({
          id: graphId,
          name: 'Graph', // We should load this
          metadata: { created: now, modified: now }, // Placeholder
          nodes,
          edges
      });
      return undefined;
  };

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
          return fromAsyncThrowable(async () => {
              const snapshot = syncEngineRef.current!.getSnapshot();
              const createdAt = graph.metadata.created || new Date().toISOString();
              const result = await storage.save(currentGraphId, snapshot, {
                   id: currentGraphId,
                   name: graph.name,
                   createdAt,
                   updatedAt: new Date().toISOString()
              });
              if (!result.ok) throw result.error;
              return undefined;
          });
      }
      // If not loaded, effectively a no-op success or error?
      // Let's return error if called without graph
      if (!syncEngineRef.current || !currentGraphId) return err(new Error("No graph loaded"));
      if (!storage) return err(new Error("Storage not available"));

      return ok(undefined);
    }, [storage, currentGraphId, graph]);

  // Schema for validating inputs to createNode
  const CreateNodeInputSchema = z.object({
      type: z.string().min(1),
      properties: z.record(z.string(), z.unknown()).optional()
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createNode = useCallback(async (type: string, properties: Record<string, any> = {}): Promise<Result<NodeId, Error>> => {
      if (!syncEngineRef.current) return err(new Error("SyncEngine not initialized"));

      return fromAsyncThrowable(async () => {
          // Validate inputs
          const input = CreateNodeInputSchema.parse({ type, properties });

          const typeId = asTypeId(input.type);

          // Safer mapping using Type Checking or explicit conversion
          // We only accept strings as text properties for now, similar to before but explicit
          const propsMap = new Map<string, PropertyValue>();

          if (input.properties) {
              Object.entries(input.properties).forEach(([key, value]) => {
                  if (typeof value === 'string') {
                      propsMap.set(key, { kind: 'text', value: value });
                  }
                  // We can add other types here as needed
              });
          }

          const newNodeResult = syncEngineRef.current!.store.addNode({
              type: typeId,
              properties: propsMap
          });

          if (!newNodeResult.ok) throw newNodeResult.error;
          const newNode = newNodeResult.value;

          const saveResult = await saveGraph();
          if (!saveResult.ok) throw saveResult.error;

          return newNode.id;
      });
  }, [saveGraph]);

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
    <GraphContext.Provider value={{ graph, syncEngine, isLoading, error, loadGraph, closeGraph, saveGraph, createNode }}>
      {children}
    </GraphContext.Provider>
  );
};

export const useGraph = () => useContext(GraphContext);
