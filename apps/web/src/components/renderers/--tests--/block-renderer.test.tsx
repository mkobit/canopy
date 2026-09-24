import '../../../test/setup';
import { afterEach, describe, it, expect } from 'bun:test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BlockRenderer } from '../block-renderer';
import { setRenderGrantForPlugin } from '../render-grants';
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

afterEach(() => {
  setRenderGrantForPlugin('plugin:missing-guest', undefined);
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
});
