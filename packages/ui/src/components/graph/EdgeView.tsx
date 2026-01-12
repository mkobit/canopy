import React from 'react';
import type { Edge, Node } from '@canopy/types';

export interface GraphNode extends Node {
  // Extend basic node with UI state (position)
  readonly position: Readonly<{ x: number, y: number }>;
}

export interface EdgeViewProps {
  readonly edge: Edge;
  readonly source: GraphNode;
  readonly target: GraphNode;
  readonly selected?: boolean | undefined;
  readonly onClick?: ((edge: Edge) => unknown) | undefined;
}

export const EdgeView: React.FC<EdgeViewProps> = ({ edge, source, target, selected, onClick }) => {
  // Let's assume the node is roughly centered at its position or top-left.
  // Usually layouts give top-left.
  // Let's assume top-left and width/height is roughly known or fixed.
  // NodeView is w-64 (256px). Let's estimate height as 100px for now or dynamic.

  // Connect centers
  const nodeWidth = 256;
  const nodeHeight = 100; // approximation

  const x1 = source.position.x + nodeWidth / 2;
  const y1 = source.position.y + nodeHeight / 2;
  const x2 = target.position.x + nodeWidth / 2;
  const y2 = target.position.y + nodeHeight / 2;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // Calculate angle for arrowhead
  const angle = Math.atan2(
y2 - y1,
x2 - x1,
) * (180 / Math.PI);

  return (
    <g onClick={(e) => { e.stopPropagation(); onClick?.(edge); return undefined; }} className="cursor-pointer group">
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={selected ? "#3b82f6" : "#cbd5e1"} // blue-500 or slate-300
        strokeWidth={selected ? 3 : 2}
        className="transition-colors group-hover:stroke-gray-400"
        markerMid="url(#arrowhead)"
      />

      {/* Directional Indicator (Arrowhead at midpoint) */}
      <path
        d="M -5 -5 L 5 0 L -5 5 z"
        fill={selected ? "#3b82f6" : "#cbd5e1"}
        transform={`translate(${midX}, ${midY}) rotate(${angle})`}
        className="transition-colors group-hover:fill-gray-400"
      />

      <text x={midX} y={midY - 10} textAnchor="middle" className="text-xs fill-gray-400 opacity-0 group-hover:opacity-100 transition-opacity bg-white">
        {edge.type}
      </text>
    </g>
  );
};
