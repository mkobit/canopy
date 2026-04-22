import React, { useEffect, useState } from 'react';
import { useParams, Outlet, useNavigate, useOutlet } from 'react-router-dom';
import { useGraph } from '../context/GraphContext';
import { asGraphId } from '@canopy/types';
import { toHandler, withResultAlert } from '../utils/handlers';
import {
  TopAppBar,
  GraphExplorerCanvas,
  InspectorPanel,
  type InspectorNodeData,
  QuickEntryOverlay,
} from '../components';
import { InteractiveGraphView } from '../components/graph/InteractiveGraphView';
import { ReactFlowProvider } from '@xyflow/react';

export const GraphPage = () => {
  const { graphId } = useParams<Readonly<{ graphId: string }>>();
  const { loadGraph, graph, isLoading, error, createNode } = useGraph();

  const navigate = useNavigate();

  const [selectedNode, setSelectedNode] = useState<InspectorNodeData | undefined>();
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  useEffect(() => {
    if (graphId) {
      loadGraph(asGraphId(graphId));
    }
    return undefined;
  }, [graphId]);

  const handleRunQuery = (query: string) => {
    // Dummy selection to show the inspector works
    setSelectedNode({
      id: 'dummy-node-1',
      name: 'Query Result Node',
      type: 'Note',
      properties: { query, matched: true },
    });
    setIsInspectorOpen(true);
    return undefined;
  };

  const closeInspector = () => {
    setIsInspectorOpen(false);
    return undefined;
  };

  const outlet = useOutlet();

  const handleQuickEntry = withResultAlert(
    (text: string) => createNode('RawNode', { name: text }),
    'Failed to capture thought',
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-on-surface">
        Loading graph...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface">
        <div className="text-error font-semibold">Error loading graph</div>
        <p className="text-on-surface-variant">{error.message}</p>
        <button
          onClick={toHandler(() => navigate('/'))}
          className="px-4 py-2 bg-surface-container rounded hover:bg-surface-container-high transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (!graph) {
    return null;
  }

  return (
    <div className="h-full flex flex-col w-full">
      <TopAppBar onRunQuery={handleRunQuery} />

      <GraphExplorerCanvas>
        {outlet ? (
          <div className="absolute inset-0 z-10 p-4 pointer-events-none">
            <Outlet context={{ setSelectedNode, setIsInspectorOpen }} />
          </div>
        ) : (
          <ReactFlowProvider>
            <InteractiveGraphView />
          </ReactFlowProvider>
        )}
        {!outlet && <QuickEntryOverlay onSubmit={handleQuickEntry} />}
      </GraphExplorerCanvas>

      {isInspectorOpen && selectedNode && (
        <InspectorPanel selectedNode={selectedNode} onClose={closeInspector} />
      )}
    </div>
  );
};
