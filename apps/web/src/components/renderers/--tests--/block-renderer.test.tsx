import '../../../test/setup';
import { afterEach, describe, it, expect } from 'bun:test';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
});
