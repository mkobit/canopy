import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import type { WasmHostBindings } from '../src/wasm/host-bindings';
import { createWasmAdapter } from '../src/wasm/wasm-adapter';

const graphId = asGraphId('wasm-adapter-graph');
const deviceId = asDeviceId('wasm-adapter-device');

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

describe('WASM WIT Protocol Adapter', () => {
  it('creates adapter with WIT spec, host bindings, and guest plugin runner', async () => {
    const context = await setupTestContext();
    const adapter = createWasmAdapter(context);

    expect(adapter.witSpec).toContain('package canopy:graph-api@0.1.0;');
    expect(adapter.hostBindings.queries.queryNodes).toBeDefined();
    expect(adapter.hostBindings.mutations.createNode).toBeDefined();
    expect(adapter.hostBindings.events.subscribeEvents).toBeDefined();

    const pluginRes = await adapter.executeGuestPlugin(
      '*',
      JSON.stringify({ message: 'hello' }),
      executeMessageCreationPlugin,
    );

    expect(pluginRes.ok).toBe(true);

    const queryRes = await adapter.hostBindings.queries.queryNodes(
      'read:nodes',
      JSON.stringify({ id: 'adapter-node-1' }),
    );
    expect(queryRes.ok).toBe(true);
    if (queryRes.ok) {
      const nodes = JSON.parse(queryRes.value) as readonly { properties: { text: string } }[];
      expect(nodes[0]?.properties.text).toBe('hello');
    }
  });
});
