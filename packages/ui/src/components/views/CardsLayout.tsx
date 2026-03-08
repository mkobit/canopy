import React from 'react';
import type { Node } from '@canopy/types';
import { NodeView } from '../graph/NodeView';

export interface CardsLayoutData {
  readonly nodes: readonly Node[];
}

export interface CardsLayoutEvents {
  readonly onNodeClick: (node: Node) => unknown;
}

export type CardsLayoutProps = CardsLayoutData & CardsLayoutEvents;

export const CardsLayout: React.FC<CardsLayoutProps> = ({ nodes, onNodeClick }) => {
  if (nodes.length === 0) {
    return <div className="p-8 text-center text-gray-500">No nodes found.</div>;
  }

  return (
    <div className="flex flex-wrap gap-4 p-6">
      {nodes.map((node) => (
        <NodeView key={node.id} node={node} onClick={onNodeClick} />
      ))}
    </div>
  );
};
