import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGraph } from '../../../context/graph-context';
import { SYSTEM_EDGE_TYPES } from '@canopy/core';
import type { NodeId, Node } from '@canopy/types';

export const Breadcrumb: React.FC = () => {
  const { graph } = useGraph();
  const { graphId, nodeId, viewId } = useParams();

  const pathNodes = useMemo(() => {
    if (!graph || (!nodeId && !viewId)) return [];

    const startNodeId = (nodeId || viewId) as NodeId;

    const getPath = (
      currentId: NodeId,
      visited: ReadonlySet<NodeId> = new Set(),
    ): readonly Node[] => {
      if (visited.has(currentId)) return [];
      const node = graph.nodes.get(currentId);
      if (!node) return [];

      const parentEdge = [...graph.edges.values()].find(
        (e) => e.source === currentId && e.type === SYSTEM_EDGE_TYPES.CHILD_OF,
      );

      const nextVisited = new Set(visited);
      // eslint-disable-next-line functional/immutable-data
      nextVisited.add(currentId);

      if (parentEdge) {
        return [...getPath(parentEdge.target, nextVisited), node];
      }
      return [node];
    };

    return getPath(startNodeId);
  }, [graph, nodeId, viewId]);

  if (!graphId) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-on-surface-variant overflow-x-auto whitespace-nowrap px-4 py-2 bg-surface-container-low border-b border-outline-variant/20">
      <Link
        to={`/graph/${graphId}`}
        className="hover:text-primary transition-colors flex items-center gap-1"
      >
        <span className="material-symbols-outlined text-[16px]">home</span>
        Graph Root
      </Link>

      {pathNodes.map((node, index) => (
        <React.Fragment key={node.id}>
          <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
          <Link
            to={`/graph/${graphId}/node/${node.id}`}
            className={`hover:text-primary transition-colors max-w-[150px] truncate ${index === pathNodes.length - 1 ? 'text-on-surface font-medium pointer-events-none' : ''}`}
            title={String((node.properties.get('name') as { value?: string })?.value || node.type)}
          >
            {String((node.properties.get('name') as { value?: string })?.value || node.type)}
          </Link>
        </React.Fragment>
      ))}
    </div>
  );
};
