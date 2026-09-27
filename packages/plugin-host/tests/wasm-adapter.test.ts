import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createGraphAccessContext } from '@canopy/graph-access';
import type { WasmHostBindings } from '../src/wasm/host-bindings';
import { createWasmAdapter } from '../src/wasm/wasm-adapter';
import { DEFAULT_WASM_FUEL_LIMIT } from '../src/wasm/sandboxed-executor';

const graphId = asGraphId('wasm-adapter-graph');
const deviceId = asDeviceId('wasm-adapter-device');

const setupTestContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();

  return createGraphAccessContext({
    graph: session.graph(),
    session,
    eventLogStore,
  });
};

const executeMessageCreationPlugin = async (
  hostBindings: WasmHostBindings,
  inputJson: string,
): Promise<string> => {
  const input = JSON.parse(inputJson) as { message: string };
  await hostBindings.mutations.createNode(
    '*',
    JSON.stringify({
      id: 'adapter-node-1',
      type: 'msg',
      properties: { text: input.message },
    }),
  );
  return JSON.stringify({ ok: true });
};

const executeTwoReads = async (hostBindings: WasmHostBindings): Promise<string> =>
  JSON.stringify([
    await hostBindings.queries.queryNodes('read:nodes', '{}'),
    await hostBindings.queries.queryNodes('read:nodes', '{}'),
  ]);

describe('WASM WIT Protocol Adapter', () => {
  it('retains the default total fuel limit', () => {
    expect(DEFAULT_WASM_FUEL_LIMIT).toBe(1_000_000n);
  });

  it('creates adapter with WIT spec, host bindings, and guest plugin runner', async () => {
    const context = await setupTestContext();
    const adapter = createWasmAdapter(context);

    expect(adapter.witSpec).toContain('package canopy:graph-api@0.1.0;');
    expect(adapter.hostBindings.queries.queryNodes).toBeDefined();
    expect(adapter.hostBindings.mutations.createNode).toBeDefined();
    expect(adapter.hostBindings.events.subscribeEvents).toBeDefined();

    const pluginResult = await adapter.executeGuestPlugin(
      '*',
      JSON.stringify({ message: 'hello' }),
      executeMessageCreationPlugin,
    );

    expect(pluginResult.ok).toBe(true);

    const queryResult = await adapter.hostBindings.queries.queryNodes(
      'read:nodes',
      JSON.stringify({ id: 'adapter-node-1' }),
    );
    expect(queryResult.ok).toBe(true);
    if (queryResult.ok) {
      const nodes = JSON.parse(queryResult.value) as readonly { properties: { text: string } }[];
      expect(nodes[0]?.properties.text).toBe('hello');
    }
  });

  it('binds the execution token through the adapter facade', async () => {
    const context = await setupTestContext();
    const adapter = createWasmAdapter(context);

    const result = await adapter.executeGuestPlugin('read:nodes', '{}', async (hostBindings) =>
      JSON.stringify(
        await hostBindings.mutations.createNode(
          '*',
          JSON.stringify({ id: 'facade-blocked', type: 'msg', properties: {} }),
        ),
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((JSON.parse(result.value) as { ok: boolean }).ok).toBe(false);
    }
  });

  it('uses the facade fuel default unless an execution override is supplied', async () => {
    const context = await setupTestContext();
    const adapter = createWasmAdapter(context, { fuelLimit: 150n });

    const facadeDefault = await adapter.executeGuestPlugin('read:nodes', '{}', executeTwoReads);
    expect(facadeDefault.ok).toBe(true);
    if (facadeDefault.ok) {
      const results = JSON.parse(facadeDefault.value) as readonly { readonly ok: boolean }[];
      expect(results[0]?.ok).toBe(true);
      expect(results[1]?.ok).toBe(false);
    }

    const executionOverride = await adapter.executeGuestPlugin(
      'read:nodes',
      '{}',
      executeTwoReads,
      { fuelLimit: 250n },
    );
    expect(executionOverride.ok).toBe(true);
    if (executionOverride.ok) {
      const results = JSON.parse(executionOverride.value) as readonly { readonly ok: boolean }[];
      expect(results[0]?.ok).toBe(true);
      expect(results[1]?.ok).toBe(true);
    }
  });
});
