import React, { useMemo } from 'react';
import { z } from 'zod';
import type { Graph, Node, NodeId, SystemRendererEntryPoint } from '@canopy/graph';
import {
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
  getEdgesFrom,
  resolveNamespace,
  asNodeId,
  fromThrowable,
} from '@canopy/graph';
import { intersectCapabilities } from '@canopy/plugin-host';
import { resolveViewDefinition } from '@canopy/settings';
import { MarkdownRenderer } from './markdown-renderer';
import { TextBlockRenderer } from './text-block-renderer';
import { CodeBlockRenderer } from './code-block-renderer';
import { RENDERER_REGISTRY } from './registry';
import { WasmRenderedBlock } from './wasm-rendered-block';
import { Tier2RenderedBlock } from './tier2-rendered-block';
import { resolveRenderGrant } from './render-grants';
import { resolveWasmRenderDispatch } from './render-tier';
import { GenericPropertyTableInspector } from './generic-property-table-inspector';

export interface BlockRendererProperties {
  readonly node: Node;
  readonly graph: Graph;
  readonly depth?: number;
  readonly visited?: ReadonlySet<NodeId>;
}

type ResolvedRenderer =
  | Readonly<{ kind: 'system'; content: React.ReactNode }>
  | Readonly<{
      kind: 'wasm';
      pluginNode: Node;
      rendererId: NodeId;
      viewDefinitionId: NodeId;
      grantToken: string;
    }>
  | Readonly<{
      kind: 'tier2';
      pluginNode: Node;
      rendererId: NodeId;
      viewDefinitionId: NodeId;
      guestId: string;
      token: string;
    }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'property-table' }>
  | null;

const manifestSchema = z.object({ capabilities: z.array(z.string()) });

const parseManifestCapabilities = (pluginNode: Node): readonly string[] => {
  const raw = pluginNode.properties.get('manifest');
  if (typeof raw !== 'string') return [];
  const decoded = fromThrowable<unknown>(() => JSON.parse(raw));
  if (!decoded.ok) return [];
  const parsed = manifestSchema.safeParse(decoded.value);
  return parsed.success ? parsed.data.capabilities : [];
};

const resolveTier1GrantToken = (pluginNode: Node): string =>
  intersectCapabilities(parseManifestCapabilities(pluginNode), resolveRenderGrant(pluginNode));

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
      return <GenericPropertyTableInspector node={node} />;
    }
  }
}

export function renderUnavailableInteractiveRenderer(): React.ReactNode {
  return (
    <div data-testid="renderer-unavailable" role="status">
      Interactive renderer unavailable
    </div>
  );
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
    return { kind: 'property-table' };
  }
  const entryPoint = rendererNode.properties.get('entryPoint');
  if (typeof entryPoint !== 'string') {
    return { kind: 'property-table' };
  }

  // WASM renderer: `entryPoint` is the plugin node id. Resolution failure
  // (missing plugin node) cascades to the generic property inspector. The render tier is
  // resolved from the plugin's effective granted scope: an explicit
  // `render:interactive` grant routes to the Tier-2 sandboxed-iframe engine,
  // everything else to the Tier-1 sanitized-inline path (decision 2).
  if (rendererNode.properties.get('rendererKind') === 'wasm') {
    const pluginNode = graph.nodes.get(asNodeId(entryPoint));
    if (!pluginNode) {
      console.warn(`WASM renderer plugin node not found: ${entryPoint}`);
      return { kind: 'property-table' };
    }
    const dispatch = resolveWasmRenderDispatch(pluginNode);
    if (dispatch.tier === 'tier2') {
      if (
        rendererNode.properties.get('status') === 'inactive' ||
        pluginNode.properties.get('status') === 'inactive'
      ) {
        return { kind: 'unavailable' };
      }
      return {
        kind: 'tier2',
        pluginNode,
        rendererId,
        viewDefinitionId: viewDefinitionNode.id,
        guestId: dispatch.guestId,
        token: dispatch.token,
      };
    }
    if (dispatch.tier === 'unavailable') {
      return { kind: 'unavailable' };
    }
    if (
      rendererNode.properties.get('status') === 'inactive' ||
      pluginNode.properties.get('status') === 'inactive'
    ) {
      return { kind: 'property-table' };
    }
    return {
      kind: 'wasm',
      pluginNode,
      rendererId,
      viewDefinitionId: viewDefinitionNode.id,
      grantToken: resolveTier1GrantToken(pluginNode),
    };
  }

  if (rendererNode.properties.get('status') === 'inactive') {
    return { kind: 'property-table' };
  }

  if (!isSystemRendererEntryPoint(entryPoint)) {
    return { kind: 'property-table' };
  }
  const rendererComponent = RENDERER_REGISTRY.get(entryPoint);
  if (!rendererComponent) {
    return { kind: 'property-table' };
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

function renderResolvedContent(
  node: Node,
  graph: Graph,
  resolved: ResolvedRenderer,
): React.ReactNode {
  if (resolved === null) {
    return renderNativeFallback(node);
  }
  switch (resolved.kind) {
    case 'property-table': {
      return <GenericPropertyTableInspector node={node} />;
    }
    case 'wasm': {
      return (
        <WasmRenderedBlock
          node={node}
          graph={graph}
          pluginNode={resolved.pluginNode}
          rendererId={resolved.rendererId}
          viewDefinitionId={resolved.viewDefinitionId}
          grantToken={resolved.grantToken}
          fallback={renderNativeFallback(node)}
        />
      );
    }
    case 'tier2': {
      return (
        <Tier2RenderedBlock
          node={node}
          graph={graph}
          pluginNode={resolved.pluginNode}
          rendererId={resolved.rendererId}
          viewDefinitionId={resolved.viewDefinitionId}
          guestId={resolved.guestId}
          token={resolved.token}
          fallback={renderNativeFallback(node)}
        />
      );
    }
    case 'unavailable': {
      return renderUnavailableInteractiveRenderer();
    }
    case 'system': {
      return resolved.content;
    }
  }
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
  const content = renderResolvedContent(node, graph, resolved);

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
