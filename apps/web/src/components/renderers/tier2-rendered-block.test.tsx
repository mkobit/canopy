import '../../test/setup';
import { afterEach, describe, expect, it } from 'bun:test';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  createInstant,
  SYSTEM_DEVICE_ID,
  unwrap,
  type Node,
} from '@canopy/graph';
import { Tier2RenderedBlock } from './tier2-rendered-block';
import { hashContent, renderCacheKey, setCachedRender } from './render-cache';

const graph = unwrap(createGraph(asGraphId('tier2-test-graph'), 'Tier-2 test graph'));
const buildNode = (id: string): Node => ({
  id: asNodeId(id),
  type: asTypeId('user:nodetype:tier2-test'),
  properties: new Map([['content', 'static fallback']]),
  metadata: {
    created: createInstant(),
    modified: createInstant(),
    modifiedBy: SYSTEM_DEVICE_ID,
  },
});

const node = buildNode('user:node:tier2-test');
const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
const originalIntersectionObserver = Object.getOwnPropertyDescriptor(
  globalThis,
  'IntersectionObserver',
);

afterEach(() => {
  cleanup();
  if (originalWorker === undefined) Reflect.deleteProperty(globalThis, 'Worker');
  else Object.defineProperty(globalThis, 'Worker', originalWorker);
  if (originalIntersectionObserver === undefined)
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  else Object.defineProperty(globalThis, 'IntersectionObserver', originalIntersectionObserver);
});

class OrdinaryErrorWorker extends EventTarget {
  public postMessage(message: unknown): void {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('requestId' in message) ||
      typeof message.requestId !== 'string'
    ) {
      return;
    }
    const requestId = message.requestId;
    queueMicrotask(() => {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: {
            kind: 'result',
            requestId,
            result: {
              ok: false,
              error: { category: 'INTERNAL_ERROR', message: 'ordinary execution failure' },
            },
          },
        }),
      );
    });
  }

  public terminate(): void {
    return undefined;
  }
}

class MessageErrorWorker extends EventTarget {
  public postMessage(): void {
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('messageerror')));
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

class OffscreenObserver implements IntersectionObserver {
  public readonly root = null;
  public readonly rootMargin = '0px';
  public readonly scrollMargin = '0px';
  public readonly thresholds = [0];

  public constructor(callback: IntersectionObserverCallback) {
    const entry: IntersectionObserverEntry = {
      boundingClientRect: zeroRectangle,
      intersectionRatio: 0,
      intersectionRect: zeroRectangle,
      isIntersecting: false,
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

describe.serial('Tier2RenderedBlock unavailable behavior', () => {
  it('shows a host-owned unavailable indication for a missing guest', async () => {
    render(
      <Tier2RenderedBlock
        node={node}
        graph={graph}
        pluginNode={node}
        guestId=""
        token="render:interactive"
        fallback={<span>static fallback</span>}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('renderer-unavailable')).not.toBeNull());
    expect(screen.queryByText('static fallback')).toBeNull();
    expect(screen.queryByTestId('tier2-frame')).toBeNull();
  });

  it('preserves the native fallback for an ordinary execution error', async () => {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: MessageErrorWorker,
    });
    const transportErrorNode = buildNode('user:node:tier2-message-error');

    render(
      <Tier2RenderedBlock
        node={transportErrorNode}
        graph={graph}
        pluginNode={transportErrorNode}
        guestId="fixture:message-error"
        token="render:interactive"
        fallback={<span>transport error fallback</span>}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('tier2-rendered-block').dataset.renderStatus).toBe('error'),
    );
    expect(screen.queryByText('transport error fallback')).not.toBeNull();
    expect(screen.queryByTestId('renderer-unavailable')).toBeNull();
  });

  it('preserves the native fallback for a serialized guest execution error', async () => {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: OrdinaryErrorWorker,
    });
    const errorNode = buildNode('user:node:tier2-error');

    render(
      <Tier2RenderedBlock
        node={errorNode}
        graph={graph}
        pluginNode={errorNode}
        guestId="fixture:ordinary-error"
        token="render:interactive"
        fallback={<span>ordinary fallback</span>}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('tier2-rendered-block').dataset.renderStatus).toBe('error'),
    );
    expect(screen.queryByText('ordinary fallback')).not.toBeNull();
    expect(screen.queryByTestId('renderer-unavailable')).toBeNull();
  });

  it('preserves the static preview for ready output while off-screen', async () => {
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: OffscreenObserver,
    });
    const offscreenNode = buildNode('user:node:tier2-offscreen');
    setCachedRender(
      renderCacheKey(offscreenNode.id, hashContent(offscreenNode)),
      '<p>cached interactive output</p>',
    );

    render(
      <Tier2RenderedBlock
        node={offscreenNode}
        graph={graph}
        pluginNode={offscreenNode}
        guestId="fixture:interactive"
        token="render:interactive"
        fallback={<span>off-screen preview</span>}
      />,
    );

    await waitFor(() => expect(screen.queryByText('off-screen preview')).not.toBeNull());
    expect(screen.queryByTestId('tier2-frame')).toBeNull();
    expect(screen.queryByTestId('renderer-unavailable')).toBeNull();
  });
});
