import React from 'react';
import type { Edge } from '@canopy/types';
import { NodeView } from './NodeView';
import type { GraphNode } from './EdgeView';
import { EdgeView } from './EdgeView';
import { cn } from '../../utils/cn';

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

type GraphCanvasProps = GraphCanvasData & GraphCanvasEvents;

const noop = () => { /* noop */ return undefined; };

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
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
  const nodeMap = new Map(nodes.map(n => [n.id,
n]));

  return (
    <div
      className={cn(
"relative overflow-hidden bg-slate-50 border",
className,
)}
      style={{ width,
height }}
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
          onClick={() => { onNodeClick(node); return undefined; }}
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
