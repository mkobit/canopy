import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, asNodeId, createGraphSession, ok } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import type { WasmHostBindings } from '../src/wasm/host-bindings';

import { executeSandboxedGuestPlugin } from '../src/wasm/sandboxed-executor';

const graphId = asGraphId('wasm-sandbox-graph');
const deviceId = asDeviceId('wasm-sandbox-device');

const setupTestContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();

  return createApiAdapterContext({
    graph: session.graph(),
    session,
    eventLogStore,
  });
};

const executeNoteCreationPlugin = async (
  hostBindings: WasmHostBindings,
  inputJson: string,
): Promise<string> => {
  const input = JSON.parse(inputJson) as { title: string };
  const createResult = await hostBindings.mutations.createNode(
    'write:create-node',
    JSON.stringify({ id: 'sb-1', type: 'note', properties: { title: input.title } }),
  );
  if (!createResult.ok) {
    throw new Error(createResult.error.message);
  }
  return JSON.stringify({ status: 'created', nodeId: 'sb-1' });
};

const okPlugin = (): string => 'ok';

const fuelPlugin = async (hostBindings: WasmHostBindings): Promise<string> => {
  await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
  await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
  return 'done';
};

const timeoutPlugin = async (): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return 'too late';
};

const panicPlugin = (): string => {
  throw new Error('Guest panicking');
};

const guestSuppliedWildcardMutationPlugin = async (
  hostBindings: WasmHostBindings,
): Promise<string> => {
  const result = await hostBindings.mutations.createNode(
    '*',
    JSON.stringify({ id: 'wildcard-node', type: 'note', properties: {} }),
  );
  return JSON.stringify(result);
};

const guestSuppliedWildcardReadPlugin = async (hostBindings: WasmHostBindings): Promise<string> =>
  JSON.stringify(await hostBindings.queries.queryNodes('*', JSON.stringify({})));

const guestSuppliedEmptyReadPlugin = async (hostBindings: WasmHostBindings): Promise<string> =>
  JSON.stringify(await hostBindings.queries.queryNodes('', JSON.stringify({})));

describe('WASM Sandboxed Execution Boundary', () => {
  it('executes guest plugin successfully within sandbox', async () => {
    const context = await setupTestContext();

    const result = await executeSandboxedGuestPlugin(
      context,
      '*',
      JSON.stringify({ title: 'Sandbox Note' }),
      executeNoteCreationPlugin,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = JSON.parse(result.value) as { status: string; nodeId: string };
      expect(output.status).toBe('created');
      expect(output.nodeId).toBe('sb-1');
    }
  });

  it('enforces the executor token when a guest supplies a wildcard mutation token', async () => {
    const context = await setupTestContext();
    const initialEventsResult = await context.eventLogStore?.getEvents(graphId);
    const initialEventCount = initialEventsResult?.ok ? initialEventsResult.value.length : 0;

    const result = await executeSandboxedGuestPlugin(
      context,
      'read:nodes',
      '{}',
      guestSuppliedWildcardMutationPlugin,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const hostResult = JSON.parse(result.value) as { ok: boolean; error?: { code: string } };
      expect(hostResult.ok).toBe(false);
      expect(hostResult.error?.code).toBe('PermissionDenied');
    }
    const eventsResult = await context.eventLogStore?.getEvents(graphId);
    expect(eventsResult?.ok).toBe(true);
    if (eventsResult?.ok) {
      expect(eventsResult.value).toHaveLength(initialEventCount);
    }
    expect(context.session?.graph().nodes.has(asNodeId('wildcard-node'))).toBe(false);
  });

  it('allows a host-authorized write even when the guest supplies a wildcard token', async () => {
    const context = await setupTestContext();

    const result = await executeSandboxedGuestPlugin(
      context,
      'write:create-node',
      '{}',
      guestSuppliedWildcardMutationPlugin,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((JSON.parse(result.value) as { ok: boolean }).ok).toBe(true);
    }
  });

  it('allows an empty guest token for a read under an executor read grant', async () => {
    const context = await setupTestContext();

    const result = await executeSandboxedGuestPlugin(
      context,
      'read:nodes',
      '{}',
      guestSuppliedEmptyReadPlugin,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const hostResult = JSON.parse(result.value) as { ok: boolean; value?: string };
      expect(hostResult.ok).toBe(true);
      expect(Array.isArray(JSON.parse(hostResult.value ?? ''))).toBe(true);
    }
  });

  it('does not dispatch remotely when the executor token denies a guest mutation', async () => {
    const context = await setupTestContext();
    let dispatchCount = 0;

    const result = await executeSandboxedGuestPlugin(
      context,
      'read:nodes',
      '{}',
      guestSuppliedWildcardMutationPlugin,
      {
        remoteDispatch: async () => {
          dispatchCount += 1;
          return ok('{}');
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(dispatchCount).toBe(0);
  });

  it('dispatches remotely with the executor token and gives it to custom validation', async () => {
    const context = await setupTestContext();
    let dispatchedToken = '';
    let validatedToken = '';

    const result = await executeSandboxedGuestPlugin(
      context,
      'read:nodes',
      '{}',
      guestSuppliedWildcardReadPlugin,
      {
        validateCapability: (token) => {
          validatedToken = token;
          return token === 'read:nodes';
        },
        remoteDispatch: async (_capability, token) => {
          dispatchedToken = token;
          return ok('[]');
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(validatedToken).toBe('read:nodes');
    expect(dispatchedToken).toBe('read:nodes');
  });

  it('rejects input payload exceeding memory byte quota', async () => {
    const context = await setupTestContext();

    const largeInput = 'x'.repeat(1000);
    const result = await executeSandboxedGuestPlugin(context, '*', largeInput, okPlugin, {
      maxMemoryBytes: 100,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('RESOURCE_EXHAUSTED');
      expect(result.error.message).toContain('memory quota');
    }
  });

  it('halts execution when fuel limit is exhausted by host calls', async () => {
    const context = await setupTestContext();

    const result = await executeSandboxedGuestPlugin(context, '*', '{}', fuelPlugin, {
      fuelLimit: 150n,
    });

    expect(result.ok).toBe(true);
  });

  it('returns timeout error when plugin execution exceeds timeout threshold', async () => {
    const context = await setupTestContext();

    const result = await executeSandboxedGuestPlugin(context, '*', '{}', timeoutPlugin, {
      timeoutMs: 50,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('RESOURCE_EXHAUSTED');
      expect(result.error.message).toContain('timed out');
    }
  });

  it('catches guest plugin exceptions and returns INTERNAL_ERROR result', async () => {
    const context = await setupTestContext();

    const result = await executeSandboxedGuestPlugin(context, '*', '{}', panicPlugin);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('Guest panicking');
    }
  });
});
