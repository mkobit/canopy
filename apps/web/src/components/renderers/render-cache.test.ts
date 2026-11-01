import '../../test/setup';
import { afterEach, describe, expect, it } from 'bun:test';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  addEdge,
  addNode,
  applyEvent,
  asEdgeId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  createInstant,
  removeEdge,
  SYSTEM_DEVICE_ID,
  SYSTEM_EDGE_TYPES,
  SYSTEM_IDS,
  unwrap,
  type Edge,
  type Graph,
  type Node,
  type PropertyValue,
} from '@canopy/graph';
import { createGraphAccessContext } from '@canopy/graph-access';
import { BlockRenderer } from './block-renderer';
import { executeSandboxedGuestPluginInWorker } from './execute-wasm-render-worker';
import {
  clearRenderCache,
  getCachedRender,
  hashContent,
  renderCacheKey,
  setCachedRender,
  type RenderCacheKeyInput,
} from './render-cache';
import { setRenderGrantForPlugin } from './render-grants';
import { Tier2RenderedBlock } from './tier2-rendered-block';
import { WasmRenderedBlock } from './wasm-rendered-block';

const metadata = {
  created: createInstant(),
  modified: createInstant(),
  modifiedBy: SYSTEM_DEVICE_ID,
};

const buildNode = (id: string, properties: ReadonlyMap<string, PropertyValue>): Node => ({
  id: asNodeId(id),
  type: asTypeId('user:nodetype:cache-test'),
  properties,
  metadata,
});

const baseNode = buildNode('user:node:cache-target', new Map([['content', 'identical content']]));
const emptyGraph = unwrap(createGraph(asGraphId('cache-test-graph'), 'Cache test graph'));

const baseKeyInput: RenderCacheKeyInput = {
  nodeId: baseNode.id,
  viewDefinitionId: asNodeId('user:view:alpha'),
  rendererId: asNodeId('user:renderer:one'),
  grantToken: 'render:raw-html',
  contentHash: hashContent(baseNode),
};

interface RecordedWorkerRequest {
  readonly guestId: string;
  readonly token: string;
  readonly inputJson: string;
}

const recordedRequests: RecordedWorkerRequest[] = [];
const workerPoolState = { pooledCount: 0 };

class RecordingRenderWorker extends EventTarget {
  public postMessage(message: unknown): void {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('requestId' in message) ||
      typeof message.requestId !== 'string'
    ) {
      return;
    }
    if ('guestId' in message && message.guestId === '__drain__') {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('messageerror')));
      return;
    }
    const guestId =
      'guestId' in message && typeof message.guestId === 'string' ? message.guestId : '';
    const token = 'token' in message && typeof message.token === 'string' ? message.token : '';
    const inputJson =
      'inputJson' in message && typeof message.inputJson === 'string' ? message.inputJson : '';
    recordedRequests.push({ guestId, token, inputJson });
    workerPoolState.pooledCount += 1;
    const callNumber = recordedRequests.length;
    const requestId = message.requestId;
    const html = `<p data-call="${callNumber}">guest=${guestId};grant=${token}</p>`;
    queueMicrotask(() => {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: {
            kind: 'result',
            requestId,
            result: { ok: true, value: JSON.stringify({ html }) },
          },
        }),
      );
    });
  }

  public terminate(): void {
    return undefined;
  }
}

const zeroRectangle: DOMRectReadOnly = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

class InViewportObserver implements IntersectionObserver {
  public readonly root = null;
  public readonly rootMargin = '0px';
  public readonly scrollMargin = '0px';
  public readonly thresholds = [0];

  public constructor(callback: IntersectionObserverCallback) {
    const entry: IntersectionObserverEntry = {
      boundingClientRect: zeroRectangle,
      intersectionRatio: 1,
      intersectionRect: zeroRectangle,
      isIntersecting: true,
      rootBounds: null,
      target: document.createElement('div'),
      time: 0,
    };
    queueMicrotask(() => callback([entry], this));
  }

  public disconnect(): void {
    return undefined;
  }

  public observe(): void {
    return undefined;
  }

  public unobserve(): void {
    return undefined;
  }

  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
const originalIntersectionObserver = Object.getOwnPropertyDescriptor(
  globalThis,
  'IntersectionObserver',
);
const touchedPluginIds = ['plugin:interactive-1', 'plugin:interactive-2', 'plugin:tier-switch'];

const installInteractiveEnvironment = (): void => {
  Object.defineProperties(globalThis, {
    Worker: {
      configurable: true,
      value: RecordingRenderWorker,
    },
    IntersectionObserver: {
      configurable: true,
      value: InViewportObserver,
    },
  });
};

afterEach(async () => {
  cleanup();
  clearRenderCache();
  recordedRequests.length = 0;
  for (const pluginId of touchedPluginIds) {
    setRenderGrantForPlugin(pluginId, undefined);
  }
  while (workerPoolState.pooledCount > 0) {
    workerPoolState.pooledCount -= 1;
    await executeSandboxedGuestPluginInWorker(
      createGraphAccessContext({ graph: emptyGraph }),
      '',
      '{}',
      '__drain__',
    );
  }
  if (originalWorker === undefined) Reflect.deleteProperty(globalThis, 'Worker');
  else Object.defineProperty(globalThis, 'Worker', originalWorker);
  if (originalIntersectionObserver === undefined)
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  else Object.defineProperty(globalThis, 'IntersectionObserver', originalIntersectionObserver);
});

describe('renderCacheKey and LRU cache isolation', () => {
  it('returns deterministic keys for identical context and content', () => {
    expect(renderCacheKey(baseKeyInput)).toBe(renderCacheKey({ ...baseKeyInput }));
  });

  it('produces distinct keys when viewDefinitionId, rendererId, or grantToken changes on identical content', () => {
    const baseline = renderCacheKey(baseKeyInput);
    const differentView = renderCacheKey({
      ...baseKeyInput,
      viewDefinitionId: asNodeId('user:view:beta'),
    });
    const differentRenderer = renderCacheKey({
      ...baseKeyInput,
      rendererId: asNodeId('user:renderer:two'),
    });
    const differentGrant = renderCacheKey({
      ...baseKeyInput,
      grantToken: 'render:raw-html render:interactive',
    });
    const differentNode = renderCacheKey({
      ...baseKeyInput,
      nodeId: asNodeId('user:node:other'),
    });
    const differentContent = renderCacheKey({
      ...baseKeyInput,
      contentHash: hashContent(
        buildNode('user:node:cache-target', new Map([['content', 'edited content']])),
      ),
    });

    const uniqueKeys = new Set([
      baseline,
      differentView,
      differentRenderer,
      differentGrant,
      differentNode,
      differentContent,
    ]);
    expect(uniqueKeys.size).toBe(6);
  });

  it('prevents delimiter collisions across colon- and space-containing identifiers', () => {
    const shiftedLeft = renderCacheKey({
      ...baseKeyInput,
      viewDefinitionId: asNodeId('user:view:alpha:extra'),
      rendererId: asNodeId('tail'),
    });
    const shiftedRight = renderCacheKey({
      ...baseKeyInput,
      viewDefinitionId: asNodeId('user:view:alpha'),
      rendererId: asNodeId('extra:tail'),
    });
    expect(shiftedLeft).not.toBe(shiftedRight);

    const swappedOrderA = renderCacheKey({
      ...baseKeyInput,
      viewDefinitionId: asNodeId('shared:id:1'),
      rendererId: asNodeId('shared:id:2'),
    });
    const swappedOrderB = renderCacheKey({
      ...baseKeyInput,
      viewDefinitionId: asNodeId('shared:id:2'),
      rendererId: asNodeId('shared:id:1'),
    });
    expect(swappedOrderA).not.toBe(swappedOrderB);
  });

  it('canonicalizes equivalent capability scope sets while distinguishing different grants', () => {
    const firstOrder = renderCacheKey({
      ...baseKeyInput,
      grantToken: 'render:raw-html render:interactive',
    });
    const reordered = renderCacheKey({
      ...baseKeyInput,
      grantToken: '  render:interactive,   render:raw-html render:interactive ',
    });
    const narrowed = renderCacheKey({
      ...baseKeyInput,
      grantToken: 'render:interactive',
    });

    expect(firstOrder).toBe(reordered);
    expect(firstOrder).not.toBe(narrowed);
  });

  it('isolates cached HTML per (view, renderer, grant) context and evicts oldest past capacity', () => {
    const keyViewA = renderCacheKey(baseKeyInput);
    const keyViewB = renderCacheKey({
      ...baseKeyInput,
      viewDefinitionId: asNodeId('user:view:beta'),
    });
    const keyRendererB = renderCacheKey({
      ...baseKeyInput,
      rendererId: asNodeId('user:renderer:two'),
    });
    const keyGrantB = renderCacheKey({
      ...baseKeyInput,
      grantToken: 'render:interactive',
    });

    setCachedRender(keyViewA, '<p>view-a</p>');
    expect(getCachedRender(keyViewA)).toBe('<p>view-a</p>');
    expect(getCachedRender(keyViewB)).toBeUndefined();
    expect(getCachedRender(keyRendererB)).toBeUndefined();
    expect(getCachedRender(keyGrantB)).toBeUndefined();

    setCachedRender(keyViewB, '<p>view-b</p>');
    setCachedRender(keyRendererB, '<p>renderer-b</p>');
    setCachedRender(keyGrantB, '<p>grant-b</p>');
    expect(getCachedRender(keyViewA)).toBe('<p>view-a</p>');
    expect(getCachedRender(keyViewB)).toBe('<p>view-b</p>');
    expect(getCachedRender(keyRendererB)).toBe('<p>renderer-b</p>');
    expect(getCachedRender(keyGrantB)).toBe('<p>grant-b</p>');

    clearRenderCache();
    for (let index = 0; index <= 256; index += 1) {
      const key = renderCacheKey({
        ...baseKeyInput,
        viewDefinitionId: asNodeId(`user:view:${index}`),
      });
      setCachedRender(key, `<p>${index}</p>`);
    }
    expect(
      getCachedRender(
        renderCacheKey({ ...baseKeyInput, viewDefinitionId: asNodeId('user:view:0') }),
      ),
    ).toBeUndefined();
    expect(
      getCachedRender(
        renderCacheKey({ ...baseKeyInput, viewDefinitionId: asNodeId('user:view:256') }),
      ),
    ).toBe('<p>256</p>');
  });
});

describe.serial(
  'WasmRenderedBlock and Tier2RenderedBlock cache invalidation on context changes',
  () => {
    it('invalidates cached Tier-1 render in WasmRenderedBlock when view, renderer, or grant changes', async () => {
      // Plugin with no capabilities resolves synchronously to fallback on cache miss without loading WASM.
      const inertPlugin = buildNode(
        'plugin:inert',
        new Map([['manifest', JSON.stringify({ capabilities: [] })]]),
      );
      const viewA = asNodeId('user:view:wasm-a');
      const viewB = asNodeId('user:view:wasm-b');
      const rendererA = asNodeId('user:renderer:wasm-a');
      const rendererB = asNodeId('user:renderer:wasm-b');

      setCachedRender(
        renderCacheKey({
          nodeId: baseNode.id,
          viewDefinitionId: viewA,
          rendererId: rendererA,
          grantToken: 'render:raw-html',
          contentHash: hashContent(baseNode),
        }),
        '<p>cached-wasm-initial</p>',
      );

      const { rerender } = render(
        React.createElement(WasmRenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode: inertPlugin,
          rendererId: rendererA,
          viewDefinitionId: viewA,
          grantToken: 'render:raw-html',
          fallback: React.createElement('span', null, 'native-fallback'),
        }),
      );

      expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('ok');
      expect(screen.queryByText('native-fallback')).toBeNull();

      // Switching ViewDefinition on identical node content misses the cache and remounts.
      rerender(
        React.createElement(WasmRenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode: inertPlugin,
          rendererId: rendererA,
          viewDefinitionId: viewB,
          grantToken: 'render:raw-html',
          fallback: React.createElement('span', null, 'native-fallback'),
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('error'),
      );
      expect(screen.queryByText('native-fallback')).not.toBeNull();

      // Switching back to viewA restores cache hit, then switching Renderer invalidates again.
      rerender(
        React.createElement(WasmRenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode: inertPlugin,
          rendererId: rendererA,
          viewDefinitionId: viewA,
          grantToken: 'render:raw-html',
          fallback: React.createElement('span', null, 'native-fallback'),
        }),
      );
      expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('ok');

      rerender(
        React.createElement(WasmRenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode: inertPlugin,
          rendererId: rendererB,
          viewDefinitionId: viewA,
          grantToken: 'render:raw-html',
          fallback: React.createElement('span', null, 'native-fallback'),
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('error'),
      );

      // Switching back to initial context hits cache, then changing grantToken invalidates again.
      rerender(
        React.createElement(WasmRenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode: inertPlugin,
          rendererId: rendererA,
          viewDefinitionId: viewA,
          grantToken: 'render:raw-html',
          fallback: React.createElement('span', null, 'native-fallback'),
        }),
      );
      expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('ok');

      rerender(
        React.createElement(WasmRenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode: inertPlugin,
          rendererId: rendererA,
          viewDefinitionId: viewA,
          grantToken: 'render:raw-html read:nodes',
          fallback: React.createElement('span', null, 'native-fallback'),
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('error'),
      );
    });

    it('re-renders Tier2RenderedBlock when viewDefinitionId, rendererId, or token changes on identical node content', async () => {
      installInteractiveEnvironment();
      const pluginNode = buildNode('plugin:interactive-1', new Map());
      const viewA = asNodeId('user:view:tier2-a');
      const viewB = asNodeId('user:view:tier2-b');
      const rendererA = asNodeId('user:renderer:tier2-a');
      const rendererB = asNodeId('user:renderer:tier2-b');

      const { rerender } = render(
        React.createElement(Tier2RenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode,
          rendererId: rendererA,
          viewDefinitionId: viewA,
          guestId: 'guest:alpha',
          token: 'render:interactive',
          fallback: React.createElement('span', null, 'preview'),
        }),
      );

      await waitFor(() => expect(screen.queryByTestId('tier2-frame')).not.toBeNull());
      expect(recordedRequests).toHaveLength(1);
      expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain('data-call="1"');

      // Change viewDefinitionId on identical node content -> fresh worker execution.
      rerender(
        React.createElement(Tier2RenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode,
          rendererId: rendererA,
          viewDefinitionId: viewB,
          guestId: 'guest:alpha',
          token: 'render:interactive',
          fallback: React.createElement('span', null, 'preview'),
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain('data-call="2"'),
      );
      expect(recordedRequests).toHaveLength(2);

      // Change rendererId on identical node content -> fresh worker execution.
      rerender(
        React.createElement(Tier2RenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode,
          rendererId: rendererB,
          viewDefinitionId: viewB,
          guestId: 'guest:beta',
          token: 'render:interactive',
          fallback: React.createElement('span', null, 'preview'),
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain(
          'guest=guest:beta',
        ),
      );
      expect(recordedRequests).toHaveLength(3);

      // Change grant token on identical node content, view, and renderer -> fresh worker execution.
      rerender(
        React.createElement(Tier2RenderedBlock, {
          node: baseNode,
          graph: emptyGraph,
          pluginNode,
          rendererId: rendererB,
          viewDefinitionId: viewB,
          guestId: 'guest:beta',
          token: 'render:interactive read:nodes',
          fallback: React.createElement('span', null, 'preview'),
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain(
          'grant=render:interactive read:nodes',
        ),
      );
      expect(recordedRequests).toHaveLength(4);
    });

    it('re-renders through BlockRenderer when ViewDefinition, Renderer, or capability grants change on identical node content', async () => {
      installInteractiveEnvironment();

      const nodeId = asNodeId('user:node:block-dispatch');
      const viewAId = asNodeId('user:view:dispatch-a');
      const viewBId = asNodeId('user:view:dispatch-b');
      const renderer1Id = asNodeId('user:renderer:dispatch-1');
      const renderer2Id = asNodeId('user:renderer:dispatch-2');
      const plugin1Id = asNodeId('plugin:interactive-1');
      const plugin2Id = asNodeId('plugin:interactive-2');
      const overrideEdgeAId = asEdgeId('user:edge:override-a');
      const overrideEdgeBId = asEdgeId('user:edge:override-b');
      const usesRenderer1EdgeId = asEdgeId('user:edge:view-b-uses-1');
      const usesRenderer2EdgeId = asEdgeId('user:edge:view-b-uses-2');

      const targetNode: Node = {
        id: nodeId,
        type: asTypeId('user:nodetype:dispatch'),
        properties: new Map([['content', 'unchanged block body']]),
        metadata,
      };

      const projectEvents = (
        current: Graph,
        events: readonly Parameters<typeof applyEvent>[1][],
      ): Graph => {
        let nextGraph = current;
        for (const event of events) {
          nextGraph = unwrap(applyEvent(nextGraph, event));
        }
        return nextGraph;
      };
      const addNodeUnwrapped = (current: Graph, next: Node): Graph =>
        projectEvents(
          current,
          unwrap(addNode(current, next, { deviceId: SYSTEM_DEVICE_ID })).events,
        );
      const addEdgeUnwrapped = (current: Graph, next: Edge): Graph =>
        projectEvents(
          current,
          unwrap(addEdge(current, next, { deviceId: SYSTEM_DEVICE_ID })).events,
        );
      const removeEdgeUnwrapped = (current: Graph, edgeId: ReturnType<typeof asEdgeId>): Graph =>
        projectEvents(
          current,
          unwrap(removeEdge(current, edgeId, { deviceId: SYSTEM_DEVICE_ID })).events,
        );

      let graph = unwrap(createGraph(asGraphId('dispatch-cache-graph'), 'Dispatch cache graph'));
      graph = addNodeUnwrapped(graph, targetNode);
      graph = addNodeUnwrapped(graph, {
        id: viewAId,
        type: SYSTEM_IDS.VIEW_DEFINITION,
        properties: new Map([['name', 'View A']]),
        metadata,
      });
      graph = addNodeUnwrapped(graph, {
        id: viewBId,
        type: SYSTEM_IDS.VIEW_DEFINITION,
        properties: new Map([['name', 'View B']]),
        metadata,
      });
      graph = addNodeUnwrapped(graph, {
        id: renderer1Id,
        type: SYSTEM_IDS.RENDERER,
        properties: new Map([
          ['rendererKind', 'wasm'],
          ['entryPoint', plugin1Id],
        ]),
        metadata,
      });
      graph = addNodeUnwrapped(graph, {
        id: renderer2Id,
        type: SYSTEM_IDS.RENDERER,
        properties: new Map([
          ['rendererKind', 'wasm'],
          ['entryPoint', plugin2Id],
        ]),
        metadata,
      });
      graph = addNodeUnwrapped(graph, {
        id: plugin1Id,
        type: asTypeId('canopy:system/plugin'),
        properties: new Map([
          ['manifest', JSON.stringify({ capabilities: ['render:interactive', 'read:nodes'] })],
          ['workerGuestId', 'guest:one'],
        ]),
        metadata,
      });
      graph = addNodeUnwrapped(graph, {
        id: plugin2Id,
        type: asTypeId('canopy:system/plugin'),
        properties: new Map([
          ['manifest', JSON.stringify({ capabilities: ['render:interactive', 'read:nodes'] })],
          ['workerGuestId', 'guest:two'],
        ]),
        metadata,
      });

      // Both View A and View B initially reference Renderer 1.
      graph = addEdgeUnwrapped(graph, {
        id: asEdgeId('user:edge:view-a-uses-1'),
        type: SYSTEM_EDGE_TYPES.USES_RENDERER,
        source: viewAId,
        target: renderer1Id,
        properties: new Map(),
        metadata,
      });
      graph = addEdgeUnwrapped(graph, {
        id: usesRenderer1EdgeId,
        type: SYSTEM_EDGE_TYPES.USES_RENDERER,
        source: viewBId,
        target: renderer1Id,
        properties: new Map(),
        metadata,
      });
      graph = addEdgeUnwrapped(graph, {
        id: overrideEdgeAId,
        type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
        source: nodeId,
        target: viewAId,
        properties: new Map(),
        metadata,
      });

      setRenderGrantForPlugin(plugin1Id, 'render:interactive');
      setRenderGrantForPlugin(plugin2Id, 'render:interactive');

      const { rerender } = render(React.createElement(BlockRenderer, { node: targetNode, graph }));
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain('data-call="1"'),
      );
      expect(recordedRequests).toHaveLength(1);

      // 1. Switch ViewDefinition (View A -> View B) on identical node content & same Renderer 1.
      const graphWithViewB = addEdgeUnwrapped(removeEdgeUnwrapped(graph, overrideEdgeAId), {
        id: overrideEdgeBId,
        type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
        source: nodeId,
        target: viewBId,
        properties: new Map(),
        metadata,
      });

      rerender(React.createElement(BlockRenderer, { node: targetNode, graph: graphWithViewB }));
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain('data-call="2"'),
      );
      expect(recordedRequests).toHaveLength(2);

      // Switching back to View A hits View A's cached output without re-running the worker.
      rerender(React.createElement(BlockRenderer, { node: targetNode, graph }));
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain('data-call="1"'),
      );
      expect(recordedRequests).toHaveLength(2);

      // 2. Switch Renderer on View B (Renderer 1 -> Renderer 2) with identical node content.
      const graphWithRenderer2 = addEdgeUnwrapped(
        removeEdgeUnwrapped(graphWithViewB, usesRenderer1EdgeId),
        {
          id: usesRenderer2EdgeId,
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: viewBId,
          target: renderer2Id,
          properties: new Map(),
          metadata,
        },
      );

      rerender(React.createElement(BlockRenderer, { node: targetNode, graph: graphWithRenderer2 }));
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain(
          'guest=guest:two',
        ),
      );
      expect(recordedRequests).toHaveLength(3);

      // 3. Widen capability grant for plugin 2 on identical node content, View B, and Renderer 2.
      setRenderGrantForPlugin(plugin2Id, 'render:interactive read:nodes');
      rerender(React.createElement(BlockRenderer, { node: targetNode, graph: graphWithRenderer2 }));
      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain(
          'grant=render:interactive read:nodes',
        ),
      );
      expect(recordedRequests).toHaveLength(4);
    });

    it('does not reuse cached Tier-1 static HTML when capability grant upgrades to Tier-2 on identical node, view, and renderer', async () => {
      installInteractiveEnvironment();

      const nodeId = asNodeId('user:node:tier-switch');
      const viewId = asNodeId('user:view:tier-switch');
      const rendererId = asNodeId('user:renderer:tier-switch');
      const pluginId = asNodeId('plugin:tier-switch');

      const targetNode: Node = {
        id: nodeId,
        type: asTypeId('user:nodetype:tier-switch'),
        properties: new Map([['content', 'same content across grant upgrade']]),
        metadata,
      };

      const addNodeUnwrapped = (current: Graph, next: Node): Graph =>
        unwrap(addNode(current, next, { deviceId: SYSTEM_DEVICE_ID })).graph;
      const addEdgeUnwrapped = (current: Graph, next: Edge): Graph =>
        unwrap(addEdge(current, next, { deviceId: SYSTEM_DEVICE_ID })).graph;

      let graph = unwrap(createGraph(asGraphId('tier-switch-graph'), 'Tier switch graph'));
      graph = addNodeUnwrapped(graph, targetNode);
      graph = addNodeUnwrapped(graph, {
        id: viewId,
        type: SYSTEM_IDS.VIEW_DEFINITION,
        properties: new Map([['name', 'Tier Switch View']]),
        metadata,
      });
      graph = addNodeUnwrapped(graph, {
        id: rendererId,
        type: SYSTEM_IDS.RENDERER,
        properties: new Map([
          ['rendererKind', 'wasm'],
          ['entryPoint', pluginId],
        ]),
        metadata,
      });
      graph = addNodeUnwrapped(graph, {
        id: pluginId,
        type: asTypeId('canopy:system/plugin'),
        properties: new Map([
          ['manifest', JSON.stringify({ capabilities: ['render:raw-html', 'render:interactive'] })],
          ['workerGuestId', 'guest:tier-switch'],
        ]),
        metadata,
      });
      graph = addEdgeUnwrapped(graph, {
        id: asEdgeId('user:edge:tier-switch-uses'),
        type: SYSTEM_EDGE_TYPES.USES_RENDERER,
        source: viewId,
        target: rendererId,
        properties: new Map(),
        metadata,
      });
      graph = addEdgeUnwrapped(graph, {
        id: asEdgeId('user:edge:tier-switch-override'),
        type: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
        source: nodeId,
        target: viewId,
        properties: new Map(),
        metadata,
      });

      setCachedRender(
        renderCacheKey({
          nodeId,
          viewDefinitionId: viewId,
          rendererId,
          grantToken: 'render:raw-html',
          contentHash: hashContent(targetNode),
        }),
        '<p>cached-static-tier1</p>',
      );

      const { rerender } = render(React.createElement(BlockRenderer, { node: targetNode, graph }));
      expect(screen.getByTestId('wasm-rendered-block').dataset.renderStatus).toBe('ok');
      expect(recordedRequests).toHaveLength(0);

      // Granting `render:interactive` upgrades the effective token and misses the Tier-1 cache entry.
      setRenderGrantForPlugin(pluginId, 'render:raw-html render:interactive');
      rerender(React.createElement(BlockRenderer, { node: targetNode, graph }));

      await waitFor(() =>
        expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).toContain(
          'guest=guest:tier-switch;grant=render:raw-html render:interactive',
        ),
      );
      expect(screen.getByTestId('tier2-frame').getAttribute('srcdoc')).not.toContain(
        'cached-static-tier1',
      );
      expect(recordedRequests).toHaveLength(1);
    });
  },
);
