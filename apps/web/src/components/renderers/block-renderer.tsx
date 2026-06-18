import React, { useMemo } from 'react';
import type { Graph, Node } from '@canopy/graph';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from '@canopy/graph';
import { MarkdownRenderer } from './markdown-renderer';
import { TextBlockRenderer } from './text-block-renderer';
import { CodeBlockRenderer } from './code-block-renderer';

export interface BlockRendererProps {
  node: Node;
  graph: Graph;
  depth?: number;
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ node, graph, depth = 0 }) => {
  // Find and sort children
  const children = useMemo(() => {
    const childEdges = [...graph.edges.values()].filter(
      (e) => e.target === node.id && e.type === SYSTEM_EDGE_TYPES.CHILD_OF,
    );

    // Sort by fractional index position
    const sortedEdges = childEdges.toSorted((a, b) => {
      const posA = (a.properties.get('position') as string) || '';
      const posB = (b.properties.get('position') as string) || '';
      return posA < posB ? -1 : posA > posB ? 1 : 0;
    });

    return sortedEdges
      .map((e) => graph.nodes.get(e.source))
      .filter((n): n is Node => n !== undefined);
  }, [graph, node.id]);

  // Determine specific renderer
  const content = (() => {
    switch (node.type) {
      case SYSTEM_IDS.TYPE_TEXT_BLOCK: {
        return <TextBlockRenderer node={node} />;
      }
      case SYSTEM_IDS.TYPE_CODE_BLOCK: {
        return <CodeBlockRenderer node={node} />;
      }
      case SYSTEM_IDS.TYPE_MARKDOWN: {
        return <MarkdownRenderer node={node} />;
      }
      default: {
        // Fallback for unknown block types
        return <div className="text-gray-400 italic">Unknown block type: {node.type}</div>;
      }
    }
  })();

  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col mb-4">
      {/* Block Content */}
      <div className="w-full relative group">{content}</div>

      {/* Children Container - nested with indentation and border */}
      {hasChildren && (
        <div className="mt-2 ml-4 pl-4 border-l-2 border-gray-100 flex flex-col gap-2">
          {children.map((child) => (
            <BlockRenderer key={child.id} node={child} graph={graph} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
