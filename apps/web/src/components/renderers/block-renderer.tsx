import React, { useMemo } from 'react';
import type { Graph, Node, NodeId, SystemRendererEntryPoint } from '@canopy/graph';
import {
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
  getEdgesFrom,
  resolveNamespace,
  asNodeId,
} from '@canopy/graph';
import { resolveViewDefinition } from '@canopy/settings';
import { MarkdownRenderer } from './markdown-renderer';
import { TextBlockRenderer } from './text-block-renderer';
import { CodeBlockRenderer } from './code-block-renderer';
import { RENDERER_REGISTRY } from './registry';
import { WasmRenderedBlock } from './wasm-rendered-block';

export interface BlockRendererProperties {
  readonly node: Node;
  readonly graph: Graph;
  readonly depth?: number;
  readonly visited?: ReadonlySet<NodeId>;
}

type ResolvedRenderer =
  | Readonly<{ kind: 'system'; content: React.ReactNode }>
  | Readonly<{ kind: 'wasm'; pluginNode: Node }>
  | null;

function isSystemRendererEntryPoint(value: string): value is SystemRendererEntryPoint {
  return (['system:text', 'system:code', 'system:markdown'] as readonly string[]).includes(value);
}

// Native, type-based renderer used both when dynamic resolution fails and as the
// pending/failure fallback for a WASM renderer.
function renderNativeFallback(node: Node): React.ReactNode {
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
}

function resolveRenderer(node: Node, graph: Graph): ResolvedRenderer {
  const namespace = resolveNamespace(graph, node);
  const viewResult = resolveViewDefinition(graph, node.id, node.type, namespace);
  if (!viewResult.ok) {
    return null;
  }
  const viewDefinitionNode = viewResult.value;
  const usesRendererEdges = getEdgesFrom(
    graph,
    viewDefinitionNode.id,
    SYSTEM_EDGE_TYPES.USES_RENDERER,
  );
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
  if (typeof entryPoint !== 'string') {
    return null;
  }

  // WASM renderer: `entryPoint` is the plugin node id. Resolution failure
  // (missing plugin node) degrades to the native fallback.
  if (rendererNode.properties.get('rendererKind') === 'wasm') {
    const pluginNode = graph.nodes.get(asNodeId(entryPoint));
    if (!pluginNode) {
      console.warn(`WASM renderer plugin node not found: ${entryPoint}`);
      return null;
    }
    return { kind: 'wasm', pluginNode };
  }

  if (!isSystemRendererEntryPoint(entryPoint)) {
    return null;
  }
  const rendererComponent = RENDERER_REGISTRY.get(entryPoint);
  if (!rendererComponent) {
    return null;
  }
  return {
    kind: 'system',
    content: React.createElement(rendererComponent, {
      node,
      graph,
      config: viewDefinitionNode.properties,
    }),
  };
}

export const BlockRenderer: React.FC<BlockRendererProperties> = ({
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
      (edge) => edge.target === node.id && edge.type === SYSTEM_EDGE_TYPES.CHILD_OF,
    );

    // Sort by fractional index position
    const sortedEdges = childEdges.toSorted((a, b) => {
      const posA = String(a.properties.get('position') ?? '');
      const posB = String(b.properties.get('position') ?? '');
      return posA < posB ? -1 : posA > posB ? 1 : 0;
    });

    return sortedEdges
      .map((edge) => graph.nodes.get(edge.source))
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

  // Determine specific renderer. WASM renderers execute a plugin asynchronously
  // and render the native fallback while pending or on failure; the existing
  // `visited`-set cycle protection above still guards child recursion, and the
  // WASM output is a leaf that never delegates child rendering back into a plugin.
  const resolved = resolveRenderer(node, graph);
  const content =
    resolved === null ? (
      renderNativeFallback(node)
    ) : resolved.kind === 'wasm' ? (
      <WasmRenderedBlock
        node={node}
        graph={graph}
        pluginNode={resolved.pluginNode}
        fallback={renderNativeFallback(node)}
      />
    ) : (
      resolved.content
    );

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
