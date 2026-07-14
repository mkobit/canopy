import React, { useMemo } from 'react';
import type { Graph, Node, NodeId, SystemRendererEntryPoint } from '@canopy/graph';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES, getEdgesFrom, resolveNamespace } from '@canopy/graph';
import { resolveViewDefinition } from '@canopy/settings';
import { MarkdownRenderer } from './markdown-renderer';
import { TextBlockRenderer } from './text-block-renderer';
import { CodeBlockRenderer } from './code-block-renderer';
import { RENDERER_REGISTRY } from './registry';

export interface BlockRendererProps {
  readonly node: Node;
  readonly graph: Graph;
  readonly depth?: number;
  readonly visited?: ReadonlySet<NodeId>;
}

function isSystemRendererEntryPoint(val: string): val is SystemRendererEntryPoint {
  return (['system:text', 'system:code', 'system:markdown'] as readonly string[]).includes(val);
}

function resolveDynamicContent(node: Node, graph: Graph): React.ReactNode | null {
  const namespace = resolveNamespace(graph, node);
  const viewResult = resolveViewDefinition(graph, node.id, node.type, namespace);
  if (!viewResult.ok) {
    return null;
  }
  const viewDefNode = viewResult.value;
  const usesRendererEdges = getEdgesFrom(graph, viewDefNode.id, SYSTEM_EDGE_TYPES.USES_RENDERER);
  const usesEdge = usesRendererEdges[0];
  if (!usesEdge) {
    return null;
  }
  const rendererId = usesEdge.target;
  const rendererNode = graph.nodes.get(rendererId);
  if (!rendererNode) {
    console.warn(`Renderer node not found: ${rendererId}`);
    return null;
  }
  const entryPoint = rendererNode.properties.get('entryPoint');
  if (typeof entryPoint !== 'string' || !isSystemRendererEntryPoint(entryPoint)) {
    return null;
  }
  const rendererComponent = RENDERER_REGISTRY.get(entryPoint);
  if (!rendererComponent) {
    return null;
  }
  return React.createElement(rendererComponent, {
    node,
    graph,
    config: viewDefNode.properties,
  });
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({
  node,
  graph,
  depth = 0,
  visited = new Set<NodeId>(),
}) => {
  // Create new visited set containing current node.id without mutations (unconditional)
  const nextVisited = useMemo(() => {
    return new Set<NodeId>([...visited, node.id]);
  }, [visited, node.id]);

  // Find and sort children (unconditional)
  const children = useMemo(() => {
    const childEdges = [...graph.edges.values()].filter(
      (e) => e.target === node.id && e.type === SYSTEM_EDGE_TYPES.CHILD_OF,
    );

    // Sort by fractional index position
    const sortedEdges = childEdges.toSorted((a, b) => {
      const posA = String(a.properties.get('position') ?? '');
      const posB = String(b.properties.get('position') ?? '');
      return posA < posB ? -1 : posA > posB ? 1 : 0;
    });

    return sortedEdges
      .map((e) => graph.nodes.get(e.source))
      .filter((n): n is Node => n !== undefined);
  }, [graph, node.id]);

  // Cycle protection check (called after hook registrations to follow rules of hooks)
  if (visited.has(node.id)) {
    return (
      <div className="text-red-500 font-medium p-2 border border-red-200 bg-red-50 rounded">
        Cycle detected: {node.id}
      </div>
    );
  }

  // Determine specific renderer
  const dynamicContent = resolveDynamicContent(node, graph);
  const content =
    dynamicContent === null
      ? (() => {
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
              return <div className="text-gray-400 italic">Unknown block type: {node.type}</div>;
            }
          }
        })()
      : dynamicContent;

  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col mb-4">
      {/* Block Content */}
      <div className="w-full relative group">{content}</div>

      {/* Children Container - nested with indentation and border */}
      {hasChildren && (
        <div className="mt-2 ml-4 pl-4 border-l-2 border-gray-100 flex flex-col gap-2">
          {children.map((child) => (
            <BlockRenderer
              key={child.id}
              node={child}
              graph={graph}
              depth={depth + 1}
              visited={nextVisited}
            />
          ))}
        </div>
      )}
    </div>
  );
};
