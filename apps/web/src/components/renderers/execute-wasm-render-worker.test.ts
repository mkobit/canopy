import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { asGraphId, createGraph, unwrap } from '@canopy/graph';
import { createGraphAccessContext } from '@canopy/graph-access';
import {
  executeSandboxedGuestPluginInWorker,
  isRenderWorkerUnavailable,
} from './execute-wasm-render-worker';

const context = createGraphAccessContext({
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
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL('tests/execute-wasm-render-worker.fixture.ts', import.meta.url)),
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 3000, killSignal: 'SIGKILL', maxBuffer: 16_384 },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
    const result: unknown = JSON.parse(stdout);
    if (typeof result !== 'object' || result === null || !('ok' in result)) {
      throw new Error('Expected an unavailable Worker result');
    }
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: {
        code: 'RENDERER_UNAVAILABLE',
        reason: 'worker-construction',
        message: expect.stringContaining('constructor blocked'),
      },
    });
  });
});
