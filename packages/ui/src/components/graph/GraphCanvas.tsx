import React from 'react';
import { Edge } from '@canopy/types';
import { NodeView } from './NodeView';
import { EdgeView, GraphNode } from './EdgeView';
import { cn } from '../../utils/cn';

interface GraphCanvasProps {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
  readonly selectedNodeIds?: ReadonlySet<string>;
  readonly selectedEdgeIds?: ReadonlySet<string>;
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly onEdgeClick?: ((edge: Edge) => void) | undefined;
  readonly onBackgroundClick?: (() => void) | undefined;
  readonly className?: string | undefined;
  readonly width?: number | string | undefined;
  readonly height?: number | string;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  selectedNodeIds = new Set(),
  selectedEdgeIds = new Set(),
  onNodeClick,
  onEdgeClick,
  onBackgroundClick,
  className,
  width = '100%',
  height = '600px',
}) => {
  // Map for easy lookup
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div
      className={cn("relative overflow-hidden bg-slate-50 border", className)}
      style={{ width, height }}
      onClick={onBackgroundClick}
    >
      <svg className="absolute inset-0 pointer-events-none w-full h-full">
        {edges.map(edge => {
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

      {nodes.map(node => (
        <NodeView
          key={node.id}
          node={node}
          selected={selectedNodeIds.has(node.id)}
          onClick={() => onNodeClick?.(node)}
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
