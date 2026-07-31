import React, { useCallback } from 'react';
import type { Edge } from '@canopy/graph';
import { NodeView } from './node-view';
import type { GraphNode } from './edge-view';
import { EdgeView } from './edge-view';
import { cn } from '../../utils/cn';
import { useSpatialGraphNavigation } from './use-spatial-graph-navigation';
import { AriaLiveRegion, useAriaLiveAnnouncer } from './aria-live-region';

interface GraphCanvasData {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
  readonly selectedNodeIds?: ReadonlySet<string>;
  readonly selectedEdgeIds?: ReadonlySet<string>;
  readonly className?: string | undefined;
  readonly width?: number | string | undefined;
  readonly height?: number | string;
}

interface GraphCanvasEvents {
  readonly onNodeClick?: (node: GraphNode) => unknown;
  readonly onEdgeClick?: (edge: Edge) => unknown;
  readonly onBackgroundClick?: () => unknown;
}

type GraphCanvasProperties = GraphCanvasData & GraphCanvasEvents;

const noop = () => {
  /* noop */ return undefined;
};

export const GraphCanvas: React.FC<GraphCanvasProperties> = ({
  nodes,
  edges,
  selectedNodeIds = new Set(),
  selectedEdgeIds = new Set(),
  onNodeClick = noop,
  onEdgeClick = noop,
  onBackgroundClick = noop,
  className,
  width = '100%',
  height = '600px',
}) => {
  // Map for easy lookup
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const selectedNodeId = [...selectedNodeIds][0];
  const { announcement, announce } = useAriaLiveAnnouncer();

  const handleSelectNode = useCallback(
    (nodeId: string | undefined) => {
      if (nodeId === undefined) {
        announce('Node selection cleared');
        return;
      }
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (targetNode) {
        onNodeClick(targetNode);
        announce(`Selected node ${nodeId}`);
      }
    },
    [nodes, onNodeClick, announce],
  );

  const { handleKeyDown } = useSpatialGraphNavigation({
    nodes,
    selectedNodeId,
    onSelectNode: handleSelectNode,
  });

  const handleBackgroundClick = useCallback(() => {
    onBackgroundClick();
    announce('Node selection cleared');
  }, [onBackgroundClick, announce]);

  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Graph visualization canvas"
      onKeyDown={handleKeyDown}
      className={cn('relative overflow-hidden bg-slate-50 border', className)}
      style={{ width, height }}
      onClick={handleBackgroundClick}
    >
      <AriaLiveRegion message={announcement} />
      <svg className="absolute inset-0 pointer-events-none w-full h-full">
        {edges.map((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;

          return (
            <EdgeView
              key={edge.id}
              edge={edge}
              source={source}
              target={target}
              selected={selectedEdgeIds.has(edge.id)}
              onClick={onEdgeClick}
            />
          );
        })}
      </svg>

      {/* Re-enable pointer events for lines */}
      <style>{`
        svg g { pointer-events: all; }
      `}</style>

      {nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          selected={selectedNodeIds.has(node.id)}
          onClick={() => {
            onNodeClick(node);
            announce(`Selected node ${node.id}`);
            return undefined;
          }}
          style={{
            position: 'absolute',
            left: node.position.x,
            top: node.position.y,
          }}
        />
      ))}
    </div>
  );
};
