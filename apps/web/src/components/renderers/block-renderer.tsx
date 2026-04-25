import React, { useMemo } from 'react';
import type { Graph, Node, NodeId } from '@canopy/types';
import { resolveSetting, resolveNamespace, SYSTEM_IDS } from '@canopy/core';
import { getSystemRenderer } from './renderer-registry';
import { MarkdownRenderer } from './markdown-renderer';
import { TextBlockRenderer } from './text-block-renderer';
import { CodeBlockRenderer } from './code-block-renderer';

export interface BlockRendererProps {
  node: Node;
  graph: Graph;
  depth?: number;
}

// Ensure these constants match `@canopy/core` without importing to avoid circular dependencies
// or hardcode for now as they are system IDs.
const SYSTEM_EDGE_TYPES_CHILD_OF = 'system:edgetype:child-of';
const NODE_TYPE_TEXT_BLOCK = 'system:nodetype:text-block';
const NODE_TYPE_CODE_BLOCK = 'system:nodetype:code-block';
const NODE_TYPE_MARKDOWN = 'system:nodetype:markdown';

export const BlockRenderer: React.FC<BlockRendererProps> = ({ node, graph, depth = 0 }) => {
  // Find and sort children
  const children = useMemo(() => {
    const childEdges = [...graph.edges.values()].filter(
      (e) => e.target === node.id && e.type === SYSTEM_EDGE_TYPES_CHILD_OF,
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

  // Meta-circular renderer resolution
  const content = useMemo(() => {
    const namespace = resolveNamespace(graph, node);
    const rendererId = resolveSetting(graph, 'default-renderer', node.id, node.type, namespace) as
      | NodeId
      | undefined;

    if (rendererId) {
      const rendererNode = graph.nodes.get(rendererId);
      if (rendererNode && rendererNode.type === SYSTEM_IDS.RENDERER) {
        const entryPoint = rendererNode.properties.get('entryPoint');
        if (typeof entryPoint === 'string') {
          const RendererComponent = getSystemRenderer(entryPoint);
          if (RendererComponent) {
            // eslint-disable-next-line react-hooks/static-components
            return <RendererComponent node={node} graph={graph} />;
          }
        }
      }
    }

    // Fallback to current hardcoded logic
    switch (node.type) {
      case NODE_TYPE_TEXT_BLOCK: {
        return <TextBlockRenderer node={node} />;
      }
      case NODE_TYPE_CODE_BLOCK: {
        return <CodeBlockRenderer node={node} />;
      }
      case NODE_TYPE_MARKDOWN: {
        return <MarkdownRenderer node={node} />;
      }
      default: {
        return <div className="text-gray-400 italic">Unknown block type: {node.type}</div>;
      }
    }
  }, [node, graph]);

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
