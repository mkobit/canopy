import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
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
  const createRes = await hostBindings.mutations.createNode(
    'write:create-node',
    JSON.stringify({ id: 'sb-1', type: 'note', properties: { title: input.title } }),
  );
  if (!createRes.ok) {
    throw new Error(createRes.error.message);
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

describe('WASM Sandboxed Execution Boundary', () => {
  it('executes guest plugin successfully within sandbox', async () => {
    const context = await setupTestContext();

    const res = await executeSandboxedGuestPlugin(
      context,
      '*',
      JSON.stringify({ title: 'Sandbox Note' }),
      executeNoteCreationPlugin,
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const output = JSON.parse(res.value) as { status: string; nodeId: string };
      expect(output.status).toBe('created');
      expect(output.nodeId).toBe('sb-1');
    }
  });

  it('rejects input payload exceeding memory byte quota', async () => {
    const context = await setupTestContext();

    const largeInput = 'x'.repeat(1000);
    const res = await executeSandboxedGuestPlugin(context, '*', largeInput, okPlugin, {
      maxMemoryBytes: 100,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('RESOURCE_EXHAUSTED');
      expect(res.error.message).toContain('memory quota');
    }
  });

  it('halts execution when fuel limit is exhausted by host calls', async () => {
    const context = await setupTestContext();

    const res = await executeSandboxedGuestPlugin(context, '*', '{}', fuelPlugin, {
      fuelLimit: 150n,
    });

    expect(res.ok).toBe(true);
  });

  it('returns timeout error when plugin execution exceeds timeout threshold', async () => {
    const context = await setupTestContext();

    const res = await executeSandboxedGuestPlugin(context, '*', '{}', timeoutPlugin, {
      timeoutMs: 50,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('RESOURCE_EXHAUSTED');
      expect(res.error.message).toContain('timed out');
    }
  });

  it('catches guest plugin exceptions and returns INTERNAL_ERROR result', async () => {
    const context = await setupTestContext();

    const res = await executeSandboxedGuestPlugin(context, '*', '{}', panicPlugin);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('INTERNAL_ERROR');
      expect(res.error.message).toContain('Guest panicking');
    }
  });
});
