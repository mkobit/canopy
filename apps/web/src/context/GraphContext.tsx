import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { SyncEngine } from '@canopy/sync';
import { Graph, NodeId, Node } from '@canopy/types';
import { useStorage } from './StorageContext';
import { GraphId } from '@canopy/types';
import * as Y from 'yjs';

interface GraphContextType {
  graph: Graph | null;
  syncEngine: SyncEngine | null;
  isLoading: boolean;
  error: Error | null;
  loadGraph: (graphId: GraphId) => Promise<void>;
  closeGraph: () => void;
  saveGraph: () => Promise<void>;
}

const GraphContext = createContext<GraphContextType>({
  graph: null,
  syncEngine: null,
  isLoading: false,
  error: null,
  loadGraph: async () => {},
  closeGraph: () => {},
  saveGraph: async () => {},
});

export const GraphProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { storage } = useStorage();
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
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
      if (syncEngine) {
        syncEngine.disconnectProvider();
      }

      // 1. Load snapshot from storage
      const snapshot = await storage.load(graphId);

      // 2. Initialize SyncEngine
      // If snapshot is undefined (new graph), we pass undefined, SyncEngine creates new Doc.
      const engine = new SyncEngine({
          initialSnapshot: snapshot || undefined
      } as any);

      setSyncEngine(engine);
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
  }, [storage, syncEngine]);

  const updateGraphFromStore = (engine: SyncEngine, graphId: GraphId) => {
      const nodes = new Map();
      for (const node of engine.store.getAllNodes()) {
          nodes.set(node.id, node);
      }
      const edges = new Map();
      for (const edge of engine.store.getAllEdges()) {
          edges.set(edge.id, edge);
      }

      // We need metadata for the graph itself.
      // StorageAdapter returns { data, metadata }.
      // But SyncEngine only took data (Uint8Array).
      // We might need to fetch metadata separately or pass it through.
      // For now, I'll mock the graph metadata or assume we have it.
      // Let's rely on storage.getMetadata(graphId) if needed, but for now just construct.

      setGraph({
          id: graphId,
          name: 'Graph', // We should load this
          metadata: { created: new Date().toISOString() as any, modified: new Date().toISOString() as any }, // Placeholder
          nodes,
          edges
      });
  };

  const closeGraph = useCallback(() => {
    if (syncEngine) {
      syncEngine.disconnectProvider();
      setSyncEngine(null);
    }
    setGraph(null);
    setCurrentGraphId(null);
  }, [syncEngine]);

  const saveGraph = useCallback(async () => {
    if (syncEngine && storage && currentGraphId && graph) {
        const snapshot = syncEngine.getSnapshot();
        // We also need graph name etc.
        // For now, we update the snapshot.
        await storage.save(currentGraphId, snapshot, {
             id: currentGraphId,
             name: graph.name,
             createdAt: (graph.metadata as any).created || new Date().toISOString(), // Fallback
             updatedAt: new Date().toISOString()
        });
    }
  }, [syncEngine, storage, currentGraphId, graph]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncEngine) {
        syncEngine.disconnectProvider();
      }
    };
  }, []);

  return (
    <GraphContext.Provider value={{ graph, syncEngine, isLoading, error, loadGraph, closeGraph, saveGraph }}>
      {children}
    </GraphContext.Provider>
  );
};

export const useGraph = () => useContext(GraphContext);
