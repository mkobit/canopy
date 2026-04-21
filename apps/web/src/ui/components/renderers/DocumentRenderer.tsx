import React from 'react';
import type { Graph, Node } from '@canopy/types';
import { BlockRenderer } from './BlockRenderer';

export interface DocumentRendererProps {
  rootNode: Node;
  graph: Graph;
  className?: string;
}

export const DocumentRenderer: React.FC<DocumentRendererProps> = ({
  rootNode,
  graph,
  className,
}) => {
  const title =
    rootNode.properties.get('name') || rootNode.properties.get('title') || 'Untitled Document';

  return (
    <div className={`max-w-4xl mx-auto w-full px-8 py-12 bg-white ${className || ''}`}>
      {/* Document Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 leading-tight">
          {title as string}
        </h1>
        <div className="text-sm text-gray-400 mt-2 font-mono">ID: {rootNode.id}</div>
      </div>

      {/* Document Content */}
      <div className="w-full">
        <BlockRenderer node={rootNode} graph={graph} />
      </div>
    </div>
  );
};
