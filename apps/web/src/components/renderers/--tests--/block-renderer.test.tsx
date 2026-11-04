import '../../../test/setup';
import { afterEach, describe, it, expect } from 'bun:test';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockRenderer } from '../block-renderer';
import { setRenderGrantForPlugin } from '../render-grants';
import { clearTier1GuestsForTest, setTier1GuestForPlugin } from '../execute-wasm-render';
import {
  createGraph,
  asGraphId,
  asNodeId,
  asTypeId,
  asEdgeId,
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
  SYSTEM_DEVICE_ID,
  createInstant,
  addNode,
  addEdge,
  unwrap,
} from '@canopy/graph';
import type { Node, Edge } from '@canopy/graph';
import type { WasmGuestPlugin } from '@canopy/plugin-host';

const dynamicTier1Guest: WasmGuestPlugin = (_bindings, inputJson) => {
  const parsed: unknown = JSON.parse(inputJson);
  const text =
    typeof parsed === 'object' && parsed !== null && 'content' in parsed
      ? String(parsed.content)
      : '';
  return JSON.stringify({ html: `<div data-testid="custom-tier1-output">${text}</div>` });
};

const panickingGuest: WasmGuestPlugin = () => {
  throw new Error('WASM memory limit exceeded');
};

afterEach(() => {
  cleanup();
  setRenderGrantForPlugin('plugin:missing-guest', undefined);
  clearTier1GuestsForTest();
});

describe('BlockRenderer', () => {
  it('renders content using type-based fallback when resolution fails', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const textNode: Node = {
      id: asNodeId('user:node:text-1'),
      type: SYSTEM_IDS.TYPE_TEXT_BLOCK,
      properties: new Map([['content', 'Hello Type Fallback']]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };

    render(<BlockRenderer node={textNode} graph={graph} />);
    expect(screen.queryByText('Hello Type Fallback')).not.toBeNull();
  });

  it('renders a cycle warning when a loop is detected', () => {
    const graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));
    const textNode: Node = {
      id: asNodeId('user:node:text-1'),
      type: SYSTEM_IDS.TYPE_TEXT_BLOCK,
      properties: new Map([['content', 'Hello Cycle']]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };

    const visited = new Set([textNode.id]);
    render(<BlockRenderer node={textNode} graph={graph} visited={visited} />);
    expect(screen.queryByText('Cycle detected: user:node:text-1')).not.toBeNull();
  });

  it('resolves and renders using dynamic renderer lookup', () => {
    let graph = unwrap(createGraph(asGraphId('test-graph'), 'Test Graph'));

    const nodeId = asNodeId('user:node:text-dynamic');
    const typeId = asTypeId('user:nodetype:custom');
    const viewNodeId = asNodeId('user:view:custom');
    const rendererNodeId = asNodeId('system:renderer:code');

    // 1. Target node
    const targetNode: Node = {
      id: nodeId,
      type: typeId,
      properties: new Map([
        ['content', 'Dynamic Content'],
        ['language', 'typescript'],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, targetNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 2. View definition node
    const viewNode: Node = {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'Custom View']]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addNode(graph, viewNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 3. VIEW_OVERRIDE edge from targetNode to viewNode
    const overrideEdge: Edge = {
      id: asEdgeId('user:edge:override'),
      type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
      source: nodeId,
      target: viewNodeId,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addEdge(graph, overrideEdge, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // 5. USES_RENDERER edge from viewNode to rendererNode
    const usesEdge: Edge = {
      id: asEdgeId('user:edge:uses-renderer'),
      type: SYSTEM_EDGE_TYPES.USES_RENDERER,
      source: viewNodeId,
      target: rendererNodeId,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
    graph = unwrap(addEdge(graph, usesEdge, { deviceId: SYSTEM_DEVICE_ID })).graph;

    // Render. Because of dynamic dispatch, targetNode should be rendered using CodeBlockRenderer
    render(<BlockRenderer node={targetNode} graph={graph} />);

    // CodeBlockRenderer displays the language in the top-right
    expect(screen.queryByText('typescript')).not.toBeNull();
    expect(screen.queryByText('Dynamic Content')).not.toBeNull();
  });

  it('fails closed through production dispatch when an authorized guest is missing', () => {
    let graph = unwrap(createGraph(asGraphId('test-unavailable-graph'), 'Test unavailable graph'));
    const nodeId = asNodeId('user:node:interactive-unavailable');
    const typeId = asTypeId('user:nodetype:interactive-unavailable');
    const viewNodeId = asNodeId('user:view:interactive-unavailable');
    const rendererNodeId = asNodeId('user:renderer:interactive-unavailable');
    const pluginNodeId = asNodeId('plugin:missing-guest');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: typeId,
      properties: new Map([['content', 'must not be shown as fallback']]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'Unavailable interactive view']]),
      metadata,
    });
    graph = add(graph, {
      id: rendererNodeId,
      type: SYSTEM_IDS.RENDERER,
      properties: new Map([
        ['rendererKind', 'wasm'],
        ['entryPoint', pluginNodeId],
      ]),
      metadata,
    });
    graph = add(graph, {
      id: pluginNodeId,
      type: asTypeId('canopy:system/plugin'),
      properties: new Map([['manifest', JSON.stringify({ capabilities: ['render:interactive'] })]]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:unavailable-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:unavailable-renderer'),
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewNodeId,
          target: rendererNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    setRenderGrantForPlugin('plugin:missing-guest', 'render:interactive');
    render(<BlockRenderer node={targetNode} graph={graph} />);

    expect(screen.queryByTestId('renderer-unavailable')).not.toBeNull();
    expect(screen.queryByText('must not be shown as fallback')).toBeNull();
  });

  it('resolves and renders a non-Markdown Tier-1 WASM guest dynamically', async () => {
    let graph = unwrap(
      createGraph(asGraphId('test-dynamic-tier1-graph'), 'Test dynamic tier1 graph'),
    );
    const nodeId = asNodeId('user:node:tier1-target');
    const typeId = asTypeId('user:nodetype:tier1-target');
    const viewNodeId = asNodeId('user:view:tier1-custom');
    const rendererNodeId = asNodeId('user:renderer:tier1-custom');
    const pluginNodeId = asNodeId('plugin:custom-tier1');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: typeId,
      properties: new Map([['content', 'Tier-1 dynamic content']]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'Custom Tier-1 View']]),
      metadata,
    });
    graph = add(graph, {
      id: rendererNodeId,
      type: SYSTEM_IDS.RENDERER,
      properties: new Map([
        ['rendererKind', 'wasm'],
        ['entryPoint', pluginNodeId],
      ]),
      metadata,
    });
    graph = add(graph, {
      id: pluginNodeId,
      type: asTypeId('canopy:system/plugin'),
      properties: new Map([
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
            entrypoint: 'custom:tier1:entrypoint',
          }),
        ],
      ]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:tier1-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:tier1-renderer'),
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewNodeId,
          target: rendererNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    setTier1GuestForPlugin('custom:tier1:entrypoint', () => dynamicTier1Guest);

    render(<BlockRenderer node={targetNode} graph={graph} />);

    await waitFor(() => {
      expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('ok');
    });

    const rendered = screen.getByTestId('wasm-rendered-block');
    expect(rendered.dataset.renderStatus).toBe('ok');
    expect(screen.queryByText('Tier-1 dynamic content')).toBeNull();
  });

  it('falls back cleanly to native renderer when a Tier-1 WASM guest is unavailable', async () => {
    let graph = unwrap(
      createGraph(asGraphId('test-unavailable-tier1-graph'), 'Test unavailable tier1'),
    );
    const nodeId = asNodeId('user:node:tier1-fallback-target');
    const typeId = SYSTEM_IDS.TYPE_TEXT_BLOCK;
    const viewNodeId = asNodeId('user:view:tier1-unavailable-view');
    const rendererNodeId = asNodeId('user:renderer:tier1-unavailable-renderer');
    const pluginNodeId = asNodeId('plugin:unavailable-tier1');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: typeId,
      properties: new Map([['content', 'Native Fallback Expected']]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'Unavailable Tier-1 View']]),
      metadata,
    });
    graph = add(graph, {
      id: rendererNodeId,
      type: SYSTEM_IDS.RENDERER,
      properties: new Map([
        ['rendererKind', 'wasm'],
        ['entryPoint', pluginNodeId],
      ]),
      metadata,
    });
    graph = add(graph, {
      id: pluginNodeId,
      type: asTypeId('canopy:system/plugin'),
      properties: new Map([
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
            entrypoint: 'missing:tier1:entrypoint',
          }),
        ],
      ]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:tier1-unavail-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:tier1-unavail-renderer'),
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewNodeId,
          target: rendererNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    render(<BlockRenderer node={targetNode} graph={graph} />);

    await waitFor(() => {
      expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('error');
    });

    expect(screen.queryByText('Native Fallback Expected')).not.toBeNull();
  });

  it('cascades to generic property table inspector when custom node type has no compatible renderer', () => {
    const graph = unwrap(
      createGraph(asGraphId('test-custom-node-graph'), 'Test custom node graph'),
    );
    const customNode: Node = {
      id: asNodeId('user:node:book-1'),
      type: asTypeId('user:nodetype:book'),
      properties: new Map([
        ['title', 'The Hobbit'],
        ['author', 'J.R.R. Tolkien'],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };

    render(<BlockRenderer node={customNode} graph={graph} />);

    expect(screen.getByTestId('generic-property-table-inspector')).not.toBeNull();
    expect(screen.queryByText('The Hobbit')).not.toBeNull();
    expect(screen.queryByText('author')).not.toBeNull();
    expect(screen.queryByText('user:nodetype:book')).not.toBeNull();
  });

  it('cascades to generic property table inspector when custom renderer definition is missing', () => {
    let graph = unwrap(
      createGraph(asGraphId('test-missing-renderer-graph'), 'Test missing renderer'),
    );
    const nodeId = asNodeId('user:node:missing-renderer-target');
    const viewNodeId = asNodeId('user:view:missing-renderer-view');
    const missingRendererId = asNodeId('user:renderer:nonexistent');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: asTypeId('user:nodetype:custom-block'),
      properties: new Map([['content', 'Cascade to inspector expected']]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'View with missing renderer']]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:missing-rend-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    // Manually attach USES_RENDERER edge referencing the missing renderer ID to simulate uninstalled renderer
    const graphWithDanglingEdge: typeof graph = {
      ...graph,
      edges: new Map([
        ...graph.edges,
        [
          asEdgeId('user:edge:missing-rend-uses'),
          {
            id: asEdgeId('user:edge:missing-rend-uses'),
            type: SYSTEM_EDGE_TYPES.USES_RENDERER,
            source: viewNodeId,
            target: missingRendererId,
            properties: new Map(),
            metadata,
          },
        ],
      ]),
    };

    render(<BlockRenderer node={targetNode} graph={graphWithDanglingEdge} />);

    expect(screen.getByTestId('generic-property-table-inspector')).not.toBeNull();
    expect(screen.queryByText('Cascade to inspector expected')).not.toBeNull();
  });

  it('cascades to generic property table inspector when custom renderer is marked inactive', () => {
    let graph = unwrap(
      createGraph(asGraphId('test-inactive-renderer-graph'), 'Test inactive renderer'),
    );
    const nodeId = asNodeId('user:node:inactive-renderer-target');
    const viewNodeId = asNodeId('user:view:inactive-renderer-view');
    const rendererNodeId = asNodeId('user:renderer:inactive-renderer');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: asTypeId('user:nodetype:custom-item'),
      properties: new Map([['description', 'Inactive renderer cascade item']]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'View with inactive renderer']]),
      metadata,
    });
    graph = add(graph, {
      id: rendererNodeId,
      type: SYSTEM_IDS.RENDERER,
      properties: new Map([
        ['status', 'inactive'],
        ['entryPoint', 'custom:inactive:entrypoint'],
      ]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:inactive-rend-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:inactive-rend-uses'),
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewNodeId,
          target: rendererNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    render(<BlockRenderer node={targetNode} graph={graph} />);

    expect(screen.getByTestId('generic-property-table-inspector')).not.toBeNull();
    expect(screen.queryByText('Inactive renderer cascade item')).not.toBeNull();
  });

  it('cascades to generic property table inspector when custom WASM plugin is marked inactive', () => {
    let graph = unwrap(
      createGraph(asGraphId('test-inactive-plugin-graph'), 'Test inactive plugin'),
    );
    const nodeId = asNodeId('user:node:inactive-plugin-target');
    const viewNodeId = asNodeId('user:view:inactive-plugin-view');
    const rendererNodeId = asNodeId('user:renderer:inactive-plugin-renderer');
    const pluginNodeId = asNodeId('plugin:inactive-tier1');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: asTypeId('user:nodetype:inactive-plugin-type'),
      properties: new Map([['summary', 'Inactive plugin item']]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'View with inactive plugin']]),
      metadata,
    });
    graph = add(graph, {
      id: rendererNodeId,
      type: SYSTEM_IDS.RENDERER,
      properties: new Map([
        ['rendererKind', 'wasm'],
        ['entryPoint', pluginNodeId],
      ]),
      metadata,
    });
    graph = add(graph, {
      id: pluginNodeId,
      type: asTypeId('canopy:system/plugin'),
      properties: new Map([
        ['status', 'inactive'],
        ['manifest', JSON.stringify({ capabilities: ['render:raw-html'] })],
      ]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:inactive-plug-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:inactive-plug-uses'),
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewNodeId,
          target: rendererNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    render(<BlockRenderer node={targetNode} graph={graph} />);

    expect(screen.getByTestId('generic-property-table-inspector')).not.toBeNull();
    expect(screen.queryByText('Inactive plugin item')).not.toBeNull();
  });

  it('fails closed to unavailable indicator when Tier 2 interactive renderer is marked inactive', () => {
    let graph = unwrap(createGraph(asGraphId('test-inactive-tier2-graph'), 'Test inactive tier2'));
    const nodeId = asNodeId('user:node:inactive-tier2-target');
    const viewNodeId = asNodeId('user:view:inactive-tier2-view');
    const rendererNodeId = asNodeId('user:renderer:inactive-tier2-renderer');
    const pluginNodeId = asNodeId('plugin:inactive-tier2');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: asTypeId('user:nodetype:tier2-type'),
      properties: new Map([['content', 'Tier 2 secret content']]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'Inactive Tier 2 View']]),
      metadata,
    });
    graph = add(graph, {
      id: rendererNodeId,
      type: SYSTEM_IDS.RENDERER,
      properties: new Map([
        ['rendererKind', 'wasm'],
        ['entryPoint', pluginNodeId],
      ]),
      metadata,
    });
    graph = add(graph, {
      id: pluginNodeId,
      type: asTypeId('canopy:system/plugin'),
      properties: new Map([
        ['status', 'inactive'],
        ['manifest', JSON.stringify({ capabilities: ['render:interactive'] })],
      ]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:inactive-tier2-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:inactive-tier2-uses'),
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewNodeId,
          target: rendererNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    setRenderGrantForPlugin('plugin:inactive-tier2', 'render:interactive');
    render(<BlockRenderer node={targetNode} graph={graph} />);

    expect(screen.getByTestId('renderer-unavailable')).not.toBeNull();
    expect(screen.queryByTestId('generic-property-table-inspector')).toBeNull();
    expect(screen.queryByText('Tier 2 secret content')).toBeNull();
  });

  it('displays structured error boundary banner on guest execution failure and toggles property inspector', async () => {
    let graph = unwrap(createGraph(asGraphId('test-panic-graph'), 'Test panic graph'));
    const nodeId = asNodeId('user:node:panic-target');
    const viewNodeId = asNodeId('user:view:panic-view');
    const rendererNodeId = asNodeId('user:renderer:panic-renderer');
    const pluginNodeId = asNodeId('plugin:panic-plugin');

    const metadata = {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    };
    const add = (nextGraph: typeof graph, nextNode: Node): typeof graph =>
      unwrap(addNode(nextGraph, nextNode, { deviceId: SYSTEM_DEVICE_ID })).graph;

    const targetNode: Node = {
      id: nodeId,
      type: asTypeId('user:nodetype:panicking'),
      properties: new Map([
        ['fieldA', 'valA'],
        ['fieldB', 'valB'],
      ]),
      metadata,
    };
    graph = add(graph, targetNode);
    graph = add(graph, {
      id: viewNodeId,
      type: SYSTEM_IDS.VIEW_DEFINITION,
      properties: new Map([['name', 'Panicking View']]),
      metadata,
    });
    graph = add(graph, {
      id: rendererNodeId,
      type: SYSTEM_IDS.RENDERER,
      properties: new Map([
        ['rendererKind', 'wasm'],
        ['entryPoint', pluginNodeId],
      ]),
      metadata,
    });
    graph = add(graph, {
      id: pluginNodeId,
      type: asTypeId('canopy:system/plugin'),
      properties: new Map([
        [
          'manifest',
          JSON.stringify({
            capabilities: ['render:raw-html'],
            entrypoint: 'custom:panicking:guest',
          }),
        ],
      ]),
      metadata,
    });
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:panic-override'),
          type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
          source: nodeId,
          target: viewNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;
    graph = unwrap(
      addEdge(
        graph,
        {
          id: asEdgeId('user:edge:panic-uses'),
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewNodeId,
          target: rendererNodeId,
          properties: new Map(),
          metadata,
        },
        { deviceId: SYSTEM_DEVICE_ID },
      ),
    ).graph;

    setTier1GuestForPlugin('custom:panicking:guest', () => panickingGuest);

    render(<BlockRenderer node={targetNode} graph={graph} />);

    await waitFor(() => {
      expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('error');
    });

    expect(screen.getByTestId('renderer-error-banner')).not.toBeNull();
    expect(screen.queryByText('Renderer execution failed')).not.toBeNull();
    expect(screen.queryByText(/WASM memory limit exceeded/)).not.toBeNull();

    // Property table should not be visible before clicking inspect button
    expect(screen.queryByTestId('generic-property-table-inspector')).toBeNull();

    // Click inspect button
    const inspectButton = screen.getByTestId('inspect-properties-button');
    fireEvent.click(inspectButton);

    // Property table should now be rendered inside the banner
    expect(screen.getByTestId('generic-property-table-inspector')).not.toBeNull();
    expect(screen.queryByText('fieldA')).not.toBeNull();
    expect(screen.queryByText('valA')).not.toBeNull();

    // Click again to toggle hide
    fireEvent.click(inspectButton);
    expect(screen.queryByTestId('generic-property-table-inspector')).toBeNull();
  });
});
