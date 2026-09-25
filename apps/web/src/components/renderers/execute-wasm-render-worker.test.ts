import { describe, expect, it } from 'bun:test';
import { asGraphId, createGraph, unwrap } from '@canopy/graph';
import { createApiAdapterContext } from '@canopy/api-adapter';
import {
  executeSandboxedGuestPluginInWorker,
  isRenderWorkerUnavailable,
} from './execute-wasm-render-worker';

const context = createApiAdapterContext({
  graph: unwrap(createGraph(asGraphId('worker-test-graph'), 'Worker test graph')),
});

describe('executeSandboxedGuestPluginInWorker unavailable boundaries', () => {
  it('fails closed before constructing a worker for a missing guest id', async () => {
    const result = await executeSandboxedGuestPluginInWorker(
      context,
      'render:interactive',
      '{}',
      '',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(isRenderWorkerUnavailable(result.error)).toBe(true);
    }
    if (!result.ok && isRenderWorkerUnavailable(result.error)) {
      expect(result.error.reason).toBe('missing-guest');
    }
  });

  it('returns unavailable when Worker construction throws', async () => {
    const result = await executeSandboxedGuestPluginInWorker(
      context,
      'render:interactive',
      '{}',
      'fixture:interactive',
      2000,
      () => {
        throw new Error('constructor blocked');
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok && isRenderWorkerUnavailable(result.error)) {
      expect(result.error.reason).toBe('worker-construction');
      expect(result.error.message).toContain('constructor blocked');
    } else {
      throw new Error('Expected an unavailable Worker result');
    }
  });
});
