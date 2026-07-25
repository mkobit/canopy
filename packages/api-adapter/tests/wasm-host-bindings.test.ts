import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import { createWasmHostBindings } from '../src/wasm/host-bindings';
import { createFuelMeter, createReentrancyGuard } from '../src/wasm/sandboxed-executor';

const graphId = asGraphId('wasm-graph-1');
const deviceId = asDeviceId('wasm-device-1');

const setupTestContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();

  const context = createApiAdapterContext({
    graph: session.graph(),
    session,
    eventLogStore,
  });

  return { context, session };
};

describe('WASM WIT Host Import Bindings', () => {
  it('executes createNode and queryNodes over WIT host bindings', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context);

    const createPayload = JSON.stringify({
      id: 'node-wit-1',
      type: 'document',
      properties: { title: 'WIT Document' },
    });

    const createRes = await hostBindings.mutations.createNode('write:create-node', createPayload);
    expect(createRes.ok).toBe(true);
    if (createRes.ok) {
      const node = JSON.parse(createRes.value) as { id: string; type: string };
      expect(node.id).toBe('node-wit-1');
      expect(node.type).toBe('document');
    }

    const queryPayload = JSON.stringify({ id: 'node-wit-1' });
    const queryRes = await hostBindings.queries.queryNodes('read:nodes', queryPayload);
    expect(queryRes.ok).toBe(true);
    if (queryRes.ok) {
      const nodes = JSON.parse(queryRes.value) as readonly {
        id: string;
        properties: { title: string };
      }[];
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.properties.title).toBe('WIT Document');
    }
  });

  it('executes edge creation and deletion mutations via host bindings', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context);

    await hostBindings.mutations.createNode(
      '*',
      JSON.stringify({ id: 'n1', type: 'doc', properties: {} }),
    );
    await hostBindings.mutations.createNode(
      '*',
      JSON.stringify({ id: 'n2', type: 'doc', properties: {} }),
    );

    const edgePayload = JSON.stringify({
      id: 'e1',
      type: 'links',
      source: 'n1',
      target: 'n2',
      properties: {},
    });

    const createEdgeRes = await hostBindings.mutations.createEdge('write:create-edge', edgePayload);
    expect(createEdgeRes.ok).toBe(true);

    const deleteEdgeRes = await hostBindings.mutations.deleteEdge(
      'write:delete-edge',
      JSON.stringify({ id: 'e1' }),
    );
    expect(deleteEdgeRes.ok).toBe(true);
  });

  it('rejects calls when capability token does not grant required scope', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context);

    const res = await hostBindings.queries.queryNodes('read:edges', JSON.stringify({}));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PermissionDenied');
      expect(res.error.message).toContain('read:nodes');
    }
  });

  it('returns VALIDATION_ERROR when payload is invalid JSON', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context);

    const res = await hostBindings.queries.queryNodes('read:nodes', '{ bad json }');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('ValidationError');
      expect(res.error.message).toContain('Invalid JSON');
    }
  });

  it('consumes fuel on host import calls and returns ResourceExhausted when depleted', async () => {
    const { context } = await setupTestContext();
    const fuelMeter = createFuelMeter(150n);
    const hostBindings = createWasmHostBindings(context, {
      fuelMeter,
      defaultFuelPerImport: 100n,
    });

    const firstRes = await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
    expect(firstRes.ok).toBe(true);
    expect(fuelMeter.remaining()).toBe(50n);

    const secondRes = await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
    expect(secondRes.ok).toBe(false);
    if (!secondRes.ok) {
      expect(secondRes.error.code).toBe('ResourceExhausted');
      expect(secondRes.error.message).toContain('fuel');
    }
  });

  it('prevents reentrant host import calls', async () => {
    const { context } = await setupTestContext();
    const reentrancyGuard = createReentrancyGuard();

    const hostBindings = createWasmHostBindings(context, { reentrancyGuard });

    reentrancyGuard.enter();

    const res = await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PermissionDenied');
      expect(res.error.message).toContain('Reentrant');
    }

    reentrancyGuard.exit();
  });
});
