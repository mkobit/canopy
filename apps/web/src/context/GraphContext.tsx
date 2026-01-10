import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { SyncEngine } from '@canopy/sync';
import { Graph, GraphId, NodeId, EdgeId, asInstant, PropertyValue, Node, Edge, Result, ok, err } from '@canopy/types';
import { useStorage } from './StorageContext';

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
    try {
      // Clean up previous engine if exists
      if (syncEngineRef.current) {
        syncEngineRef.current.disconnectProvider();
      }

      // 1. Load snapshot from storage
      const snapshotResult = await storage.load(graphId);
      if (!snapshotResult.ok) return snapshotResult;
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
      // SyncEngine.store doesn't expose getGraph(), but it exposes getAllNodes() and getAllEdges().
      // We need to construct a Graph object.
      // Wait, `Graph` type is immutable map. `GraphStore` is mutable.
      // We need to bridge this.
      // I'll create a helper to build Graph from Store.
      updateGraphFromStore(engine, graphId);

      // Subscribe to updates
      engine.doc.on('update', () => {
         updateGraphFromStore(engine, graphId);
         return undefined;
      });

      return ok(undefined);
    } catch (err) {
      console.error("Failed to load graph:", err);
      const e = err instanceof Error ? err : new Error('Unknown error loading graph');
      setError(e);
      return { ok: false, error: e };
    } finally {
      setIsLoading(false);
    }
  }, [storage]); // Removed syncEngine from dependency

  const updateGraphFromStore = (engine: SyncEngine, graphId: GraphId) => {
      const nodes = new Map<NodeId, Node>(Array.from(engine.store.getAllNodes()).map(node => [node.id, node]));
      const edges = new Map<EdgeId, Edge>(Array.from(engine.store.getAllEdges()).map(edge => [edge.id, edge]));

      // We need metadata for the graph itself.
      // StorageAdapter returns { data, metadata }.
      // But SyncEngine only took data (Uint8Array).
      // We might need to fetch metadata separately or pass it through.
      // For now, I'll mock the graph metadata or assume we have it.
      // Let's rely on storage.getMetadata(graphId) if needed, but for now just construct.

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
    try {
      if (syncEngineRef.current) {
        syncEngineRef.current.disconnectProvider();
        setSyncEngine(null);
        syncEngineRef.current = null;
      }
      setGraph(null);
      setCurrentGraphId(null);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  const saveGraph = useCallback(async (): Promise<Result<void, Error>> => {
    if (syncEngineRef.current && storage && currentGraphId && graph) {
        try {
          const snapshot = syncEngineRef.current.getSnapshot();
          const createdAt = graph.metadata.created || new Date().toISOString();
          const result = await storage.save(currentGraphId, snapshot, {
               id: currentGraphId,
               name: graph.name,
               createdAt,
               updatedAt: new Date().toISOString()
          });
          return result;
        } catch (e) {
          return err(e instanceof Error ? e : new Error(String(e)));
        }
    }
    // If not loaded, effectively a no-op success or error?
    // Let's return error if called without graph
    if (!syncEngineRef.current || !currentGraphId) return err(new Error("No graph loaded"));
    if (!storage) return err(new Error("Storage not available"));

    return ok(undefined);
  }, [storage, currentGraphId, graph]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createNode = useCallback(async (type: string, properties: Record<string, any> = {}): Promise<Result<NodeId, Error>> => {
      if (!syncEngineRef.current) return err(new Error("SyncEngine not initialized"));

      // TODO: We are going to eventually phase out the try/catch pattern so should consider that here as well
      try {
          // TODO: feels like we need a todo here to address the casting and mapping issue
          // Rudimentary generic mapping to PropertyValue
          const propsMap = new Map<string, PropertyValue>(
              Object.entries(properties)
                  .filter(([_, value]) => typeof value === 'string')
                  .map(([key, value]) => [key, { kind: 'text' as const, value: value as string }])
          );

          const newNodeResult = syncEngineRef.current.store.addNode({
              // TODO: we are going to eventually forbid casting so need to fix this too aeither now or later
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: type as any, // Cast to TypeId
              properties: propsMap
          });

          if (!newNodeResult.ok) return newNodeResult;
          const newNode = newNodeResult.value;

          const saveResult = await saveGraph();
          if (!saveResult.ok) return saveResult;

          return ok(newNode.id);
      } catch (e) {
          return err(e instanceof Error ? e : new Error(String(e)));
      }
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
