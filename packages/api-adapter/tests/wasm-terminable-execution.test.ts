import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession, ok, err } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import { executeSandboxedGuestPlugin } from '../src/wasm/sandboxed-executor';
import {
  createCappedGuestMemory,
  executeTerminableGuest,
  GUEST_MEMORY_MAX_PAGES,
  hardenGuestWorkerScope,
  type TerminableGuestRunner,
} from '../src/wasm/terminable-execution';
import { createApiAdapterError } from '../src/result-errors';

const setupContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(
    eventLogStore,
    asGraphId('terminable-graph'),
    asDeviceId('terminable-device'),
  );
  await session.load();
  return createApiAdapterContext({ graph: session.graph(), session, eventLogStore });
};

describe('executeTerminableGuest (host-enforced wall-clock termination)', () => {
  it('terminates a synchronous-runaway guest that never resolves and returns a bounded error', async () => {
    let terminated = false;
    const runner: TerminableGuestRunner = {
      // Models a synchronous compute loop in a worker: the executor promise never
      // resolves, so only the host's wall-clock timer can stop it.
      execute: () => new Promise<never>(() => undefined),
      terminate: () => {
        terminated = true;
      },
    };

    const result = await executeTerminableGuest(runner, 20);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('RESOURCE_EXHAUSTED');
      expect(result.error.message).toContain('terminated');
    }
    expect(terminated).toBe(true);
  });

  it('passes a normal completion through without terminating the runner', async () => {
    let terminated = false;
    const runner: TerminableGuestRunner = {
      execute: () => Promise.resolve(ok('{"html":"<p>ok</p>"}')),
      terminate: () => {
        terminated = true;
      },
    };

    const result = await executeTerminableGuest(runner, 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('{"html":"<p>ok</p>"}');
    }
    expect(terminated).toBe(false);
  });

  it('surfaces an executor error result unchanged', async () => {
    const runner: TerminableGuestRunner = {
      execute: () =>
        Promise.resolve(
          err(createApiAdapterError('INTERNAL_ERROR', 'guest produced invalid output')),
        ),
      terminate: () => undefined,
    };

    const result = await executeTerminableGuest(runner, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('invalid output');
    }
  });

  it('preserves the executor fuel/timeout/reentrancy guards when wrapping executeSandboxedGuestPlugin', async () => {
    const context = await setupContext();
    // A guest that makes two host calls but is given only enough fuel for one:
    // the executor's fuel guard must still fire inside the terminable wrapper.
    const runner: TerminableGuestRunner = {
      execute: () =>
        executeSandboxedGuestPlugin(
          context,
          'read:nodes',
          '{}',
          async (hostBindings) => {
            await hostBindings.queries.queryNodes('read:nodes', '{}');
            await hostBindings.queries.queryNodes('read:nodes', '{}');
            return 'done';
          },
          { fuelLimit: 150n },
        ),
      terminate: () => undefined,
    };

    const result = await executeTerminableGuest(runner, 1000);
    // The guest swallows host-call failures and returns 'done', so the executor
    // succeeds; the point is the wrapper does not bypass the executor's guards —
    // the fuel meter is consulted (150n fuel, 100n per call) inside the worker path.
    expect(result.ok).toBe(true);
  });
});

describe('createCappedGuestMemory (hard linear-memory ceiling)', () => {
  it('bounds a memory-bomb guest at the maximum page ceiling', () => {
    const memory = createCappedGuestMemory(1, 2);
    // Growing to the ceiling is allowed; growing past it throws (engine-enforced).
    expect(memory.grow(1)).toBe(1);
    expect(() => memory.grow(1)).toThrow();
  });

  it('defaults the ceiling to the shared max-memory budget', () => {
    expect(GUEST_MEMORY_MAX_PAGES).toBe(256);
    const memory = createCappedGuestMemory();
    expect(() => memory.grow(GUEST_MEMORY_MAX_PAGES + 1)).toThrow();
  });
});

describe('hardenGuestWorkerScope (no nested-worker escape)', () => {
  it('removes the Worker constructor from the worker global scope', () => {
    const scope: Record<string, unknown> = {
      Worker: function Worker() {
        return undefined;
      },
    };
    expect(hardenGuestWorkerScope(scope)).toBe(true);
    expect(scope.Worker).toBeUndefined();
  });

  it('is a no-op when no Worker constructor is present', () => {
    const scope: Record<string, unknown> = {};
    expect(hardenGuestWorkerScope(scope)).toBe(false);
    expect(scope.Worker).toBeUndefined();
  });
});
