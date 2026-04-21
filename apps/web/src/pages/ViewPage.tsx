import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGraph } from '../context/GraphContext';
import { executeView } from '@canopy/query';
import { TableLayout, ListLayout, CardsLayout } from '../ui';
import type { Node, NodeId } from '@canopy/types';

export const ViewPage = () => {
  const { viewId, graphId } = useParams<Readonly<{ viewId: string; graphId: string }>>();
  const { graph } = useGraph();
  const navigate = useNavigate();

  const viewResult = useMemo(() => {
    if (!graph || !viewId) return undefined;
    return executeView(graph, viewId as NodeId);
  }, [graph, viewId]);

  const handleNodeClick = (node: Node) => {
    navigate(`/graph/${graphId}/node/${node.id}`);
    return undefined;
  };

  if (!graph || !viewId) {
    return <div className="p-8 text-center text-gray-500">No graph loaded.</div>;
  }

  if (!viewResult) {
    return <div className="p-8 text-center text-gray-400">Loading view…</div>;
  }

  if (!viewResult.ok) {
    return <div className="p-8 text-center text-red-500">Error: {viewResult.error.message}</div>;
  }

  const { definition, nodes } = viewResult.value;

  const renderLayout = () => {
    switch (definition.layout) {
      case 'table': {
        return (
          <TableLayout
            nodes={nodes}
            {...(definition.displayProperties
              ? { displayProperties: definition.displayProperties }
              : {})}
            onNodeClick={handleNodeClick}
          />
        );
      }
      case 'list': {
        return (
          <ListLayout
            nodes={nodes}
            {...(definition.groupBy ? { groupBy: definition.groupBy } : {})}
            onNodeClick={handleNodeClick}
          />
        );
      }
      case 'cards': {
        return <CardsLayout nodes={nodes} onNodeClick={handleNodeClick} />;
      }
      default: {
        return <TableLayout nodes={nodes} onNodeClick={handleNodeClick} />;
      }
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">{definition.name}</h2>
        {definition.description && (
          <p className="text-sm text-gray-500 mt-0.5">{definition.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {nodes.length} node{nodes.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">{renderLayout()}</div>
    </div>
  );
};
