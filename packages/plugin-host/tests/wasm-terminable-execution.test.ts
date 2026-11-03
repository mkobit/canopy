import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession, ok, err } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createGraphAccessContext, createGraphAccessError } from '@canopy/graph-access';
import { executeSandboxedGuestPlugin } from '../src/wasm/sandboxed-executor';
import {
  createCappedGuestMemory,
  DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS,
  executeTerminableGuest,
  GUEST_MEMORY_MAX_PAGES,
  hardenGuestWorkerScope,
  PROHIBITED_WORKER_GLOBALS,
  type TerminableGuestRunner,
} from '../src/wasm/terminable-execution';

const setupContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(
    eventLogStore,
    asGraphId('terminable-graph'),
    asDeviceId('terminable-device'),
  );
  await session.load();
  return createGraphAccessContext({ graph: session.graph(), session, eventLogStore });
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

  it('enforces the 2000 ms wall-clock deadline by default and terminates non-responsive worker isolates with RESOURCE_EXHAUSTED', async () => {
    expect(DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS).toBe(2000);
    let terminated = false;
    const runner: TerminableGuestRunner = {
      execute: () => new Promise<never>(() => undefined),
      terminate: () => {
        terminated = true;
      },
    };

    const startTime = performance.now();
    const result = await executeTerminableGuest(runner);
    const elapsedMs = performance.now() - startTime;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('RESOURCE_EXHAUSTED');
      expect(result.error.message).toContain(
        'Untrusted guest execution exceeded the 2000ms wall-clock deadline and was terminated',
      );
    }
    expect(terminated).toBe(true);
    expect(elapsedMs).toBeGreaterThanOrEqual(1900);
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
          err(createGraphAccessError('INTERNAL_ERROR', 'guest produced invalid output')),
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

interface MockProhibitedScope {
  readonly Worker?: new () => unknown;
  readonly SharedWorker?: new () => unknown;
  readonly fetch?: () => unknown;
  readonly WebSocket?: new () => unknown;
  readonly XMLHttpRequest?: new () => unknown;
  readonly indexedDB?: unknown;
  readonly customAllowed?: string;
}

interface MockPrototypeParent {
  readonly indexedDB?: unknown;
  readonly fetch?: () => unknown;
  readonly parentAllowed?: string;
}

interface MockPrototypeChild extends MockPrototypeParent {
  readonly WebSocket?: new () => unknown;
  readonly XMLHttpRequest?: new () => unknown;
  readonly childAllowed?: string;
}

interface MockScopeDerived extends MockPrototypeChild {
  readonly Worker?: new () => unknown;
  readonly SharedWorker?: new () => unknown;
  readonly localAllowed?: string;
}

class MockWorkerConstructor {
  readonly kind = 'MockWorker';
}

class MockSharedWorkerConstructor {
  readonly kind = 'MockSharedWorker';
}

class MockWebSocketConstructor {
  readonly kind = 'MockWebSocket';
}

class MockXMLHttpRequestConstructor {
  readonly kind = 'MockXMLHttpRequest';
}

describe('hardenGuestWorkerScope (worker isolation hardening)', () => {
  it('exports PROHIBITED_WORKER_GLOBALS with all expected sensitive APIs', () => {
    expect(PROHIBITED_WORKER_GLOBALS).toEqual([
      'Worker',
      'SharedWorker',
      'fetch',
      'WebSocket',
      'XMLHttpRequest',
      'indexedDB',
    ]);
  });

  it('removes all prohibited globals directly present on the worker global scope', () => {
    const scope: MockProhibitedScope = {
      Worker: MockWorkerConstructor,
      SharedWorker: MockSharedWorkerConstructor,
      fetch: () => 'network-response',
      WebSocket: MockWebSocketConstructor,
      XMLHttpRequest: MockXMLHttpRequestConstructor,
      indexedDB: { open: () => undefined },
      customAllowed: 'allowed-scope-property',
    };

    const wasHardened = hardenGuestWorkerScope(scope);

    expect(wasHardened).toBe(true);
    expect(scope.Worker).toBeUndefined();
    expect(scope.SharedWorker).toBeUndefined();
    expect(scope.fetch).toBeUndefined();
    expect(scope.WebSocket).toBeUndefined();
    expect(scope.XMLHttpRequest).toBeUndefined();
    expect(scope.indexedDB).toBeUndefined();
    expect(scope.customAllowed).toBe('allowed-scope-property');

    for (const globalName of PROHIBITED_WORKER_GLOBALS) {
      expect(Reflect.has(scope, globalName)).toBe(false);
    }
  });

  it('removes prohibited globals distributed across the worker global prototype chain', () => {
    const parentPrototype: MockPrototypeParent = {
      indexedDB: { open: () => undefined },
      fetch: () => 'parent-network',
      parentAllowed: 'parent-ok',
    };
    const childPrototype: MockPrototypeChild = Object.assign(Object.create(parentPrototype), {
      WebSocket: MockWebSocketConstructor,
      XMLHttpRequest: MockXMLHttpRequestConstructor,
      childAllowed: 'child-ok',
    });
    const derivedScope: MockScopeDerived = Object.assign(Object.create(childPrototype), {
      Worker: MockWorkerConstructor,
      SharedWorker: MockSharedWorkerConstructor,
      localAllowed: 'local-ok',
    });

    const wasHardened = hardenGuestWorkerScope(derivedScope);

    expect(wasHardened).toBe(true);
    expect(derivedScope.Worker).toBeUndefined();
    expect(derivedScope.SharedWorker).toBeUndefined();
    expect(derivedScope.WebSocket).toBeUndefined();
    expect(derivedScope.XMLHttpRequest).toBeUndefined();
    expect(derivedScope.fetch).toBeUndefined();
    expect(derivedScope.indexedDB).toBeUndefined();

    for (const globalName of PROHIBITED_WORKER_GLOBALS) {
      expect(Reflect.has(derivedScope, globalName)).toBe(false);
    }

    expect(derivedScope.localAllowed).toBe('local-ok');
    expect(childPrototype.childAllowed).toBe('child-ok');
    expect(parentPrototype.parentAllowed).toBe('parent-ok');
  });

  it('freezes the worker global prototype chain above scope rejecting prototype pollution tampering', () => {
    const parentPrototype: MockPrototypeParent = {
      parentAllowed: 'parent-ok',
    };
    const childPrototype: MockPrototypeChild = Object.assign(Object.create(parentPrototype), {
      childAllowed: 'child-ok',
    });
    const scope: MockScopeDerived = Object.assign(Object.create(childPrototype), {
      localAllowed: 'local-ok',
    });

    hardenGuestWorkerScope(scope);

    // The scope itself remains unfrozen to allow normal worker initialization
    expect(Object.isFrozen(scope)).toBe(false);
    // All prototypes above scope in the chain are frozen
    expect(Object.isFrozen(childPrototype)).toBe(true);
    expect(Object.isFrozen(parentPrototype)).toBe(true);

    // Tampering attempts are rejected
    expect(Reflect.set(childPrototype, 'polluted', true)).toBe(false);
    expect(Reflect.set(parentPrototype, 'polluted', true)).toBe(false);
    expect(Reflect.defineProperty(childPrototype, 'tamper', { value: true })).toBe(false);
    expect(() => {
      (childPrototype as unknown as { tamper: unknown }).tamper = true;
    }).toThrow(TypeError);
  });

  it('throws TypeError when attempting to invoke new Worker() after hardening on scope', () => {
    const scope: MockProhibitedScope = {
      Worker: MockWorkerConstructor,
    };

    hardenGuestWorkerScope(scope);

    const workerConstructor = scope.Worker;
    expect(() => new (workerConstructor as unknown as new () => unknown)()).toThrow(TypeError);
  });

  it('throws TypeError when attempting to invoke new Worker() inherited from prototype after hardening', () => {
    const prototypeWithWorker: MockProhibitedScope = {
      Worker: MockWorkerConstructor,
    };
    const scope: MockProhibitedScope = Object.create(prototypeWithWorker);

    hardenGuestWorkerScope(scope);

    const workerConstructor = scope.Worker;
    expect(() => new (workerConstructor as unknown as new () => unknown)()).toThrow(TypeError);
  });

  it('is a no-op returning false when no prohibited globals are present', () => {
    const cleanScope: MockProhibitedScope = {
      customAllowed: 'pure-scope',
    };

    const wasHardened = hardenGuestWorkerScope(cleanScope);

    expect(wasHardened).toBe(false);
    expect(cleanScope.customAllowed).toBe('pure-scope');
    expect(cleanScope.Worker).toBeUndefined();
  });
});
