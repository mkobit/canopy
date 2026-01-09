import React, { useEffect } from 'react';
import { useParams, Outlet, useNavigate } from 'react-router-dom';
import { useGraph } from '../context/GraphContext';
import { asGraphId } from '@canopy/types';

export const GraphPage = () => {
  const { graphId } = useParams<Readonly<{ graphId: string }>>();
  const { loadGraph, graph, isLoading, error } = useGraph();
  const navigate = useNavigate();

  useEffect(() => {
    if (graphId) {
      loadGraph(asGraphId(graphId));
    }
  }, [graphId]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading graph...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-red-600 font-semibold">Error loading graph</div>
        <p className="text-gray-600">{error.message}</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
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
    <div className="h-full flex flex-col">
       {/* Graph Header / Toolbar could go here */}
       <div className="flex-1 overflow-auto p-4 relative">
          {/* If we are at the root of the graph, maybe show a dashboard or node list?
              For now, we render the Outlet which will likely handle specific node views.
              If no Outlet matches, we should probably redirect to a default node or show a list.
           */}
           <Outlet />

           {/* If we are exactly at /graph/:id, show the graph overview */}
           <div className="absolute inset-0 -z-10">
               {/* Background graph visualization could go here */}
           </div>
       </div>
    </div>
  );
};
