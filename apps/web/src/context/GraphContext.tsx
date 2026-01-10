import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { SyncEngine } from '@canopy/sync';
import { Graph, GraphId, NodeId, EdgeId, asInstant, PropertyValue, Node, Edge } from '@canopy/types';
import { useStorage } from './StorageContext';

interface GraphContextState {
  readonly graph: Graph | null;
  readonly syncEngine: SyncEngine | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

interface GraphContextActions {
  readonly loadGraph: (graphId: GraphId) => Promise<void>;
  readonly closeGraph: () => void;
  readonly saveGraph: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly createNode: (type: string, properties?: Record<string, any>) => Promise<NodeId | null>;
}

type GraphContextType = GraphContextState & GraphContextActions;

const GraphContext = createContext<GraphContextType>({
  graph: null,
  syncEngine: null,
  isLoading: false,
  error: null,
  loadGraph: async () => undefined,
  closeGraph: () => undefined,
  saveGraph: async () => undefined,
  createNode: async () => null,
});

export const GraphProvider: React.FC<Readonly<{ children: React.ReactNode }>> = ({ children }) => {
  const { storage } = useStorage();
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  const syncEngineRef = useRef<SyncEngine | null>(null); // Ref to avoid dependency cycles

  const [graph, setGraph] = useState<Graph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentGraphId, setCurrentGraphId] = useState<GraphId | null>(null);

  const loadGraph = useCallback(async (graphId: GraphId) => {
    if (!storage) return;

    setIsLoading(true);
    setError(null);
    try {
      // Clean up previous engine if exists
      if (syncEngineRef.current) {
        syncEngineRef.current.disconnectProvider();
      }

      // 1. Load snapshot from storage
      const snapshotResult = await storage.load(graphId);
      // eslint-disable-next-line functional/no-throw-statements
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
      // SyncEngine.store doesn't expose getGraph(), but it exposes getAllNodes() and getAllEdges().
      // We need to construct a Graph object.
      // Wait, `Graph` type is immutable map. `GraphStore` is mutable.
      // We need to bridge this.
      // I'll create a helper to build Graph from Store.
      updateGraphFromStore(engine, graphId);

      // Subscribe to updates
      engine.doc.on('update', () => {
         updateGraphFromStore(engine, graphId);
      });

    } catch (err) {
      console.error("Failed to load graph:", err);
      setError(err instanceof Error ? err : new Error('Unknown error loading graph'));
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
  };

  const closeGraph = useCallback(() => {
    if (syncEngineRef.current) {
      syncEngineRef.current.disconnectProvider();
      setSyncEngine(null);
      syncEngineRef.current = null;
    }
    setGraph(null);
    setCurrentGraphId(null);
  }, []);

  const saveGraph = useCallback(async () => {
    if (syncEngineRef.current && storage && currentGraphId && graph) {
        const snapshot = syncEngineRef.current.getSnapshot();
        const createdAt = graph.metadata.created || new Date().toISOString();
        const result = await storage.save(currentGraphId, snapshot, {
             id: currentGraphId,
             name: graph.name,
             createdAt,
             updatedAt: new Date().toISOString()
        });
        // eslint-disable-next-line functional/no-throw-statements
        if (!result.ok) throw result.error;
    }
  }, [storage, currentGraphId, graph]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createNode = useCallback(async (type: string, properties: Record<string, any> = {}) => {
      if (!syncEngineRef.current) return null;

      // Rudimentary generic mapping to PropertyValue
      const propsMap = new Map<string, PropertyValue>(
          Object.entries(properties)
              .filter(([_, value]) => typeof value === 'string')
              .map(([key, value]) => [key, { kind: 'text' as const, value: value as string }])
      );

      const newNodeResult = syncEngineRef.current.store.addNode({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: type as any, // Cast to TypeId
          properties: propsMap
      });

      // eslint-disable-next-line functional/no-throw-statements
      if (!newNodeResult.ok) throw newNodeResult.error;
      const newNode = newNodeResult.value;

      await saveGraph();
      return newNode.id;
  }, [saveGraph]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncEngineRef.current) {
        syncEngineRef.current.disconnectProvider();
      }
    };
  }, []);

  return (
    <GraphContext.Provider value={{ graph, syncEngine, isLoading, error, loadGraph, closeGraph, saveGraph, createNode }}>
      {children}
    </GraphContext.Provider>
  );
};

export const useGraph = () => useContext(GraphContext);
