import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createGraphAccessContext } from '@canopy/graph-access';
import { createWasmHostBindings } from '../src/wasm/host-bindings';
import { createFuelMeter, createReentrancyGuard } from '../src/wasm/sandboxed-executor';

const graphId = asGraphId('wasm-graph-1');
const deviceId = asDeviceId('wasm-device-1');

const setupTestContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();

  const context = createGraphAccessContext({
    graph: session.graph(),
    session,
    eventLogStore,
  });

  return { context, session };
};

const expectHostSuccess = async (
  resultPromise: Promise<Readonly<{ ok: boolean }>>,
): Promise<void> => {
  const result = await resultPromise;
  expect(result.ok).toBe(true);
};

describe('WASM WIT Host Import Bindings', () => {
  it('executes createNode and queryNodes over WIT host bindings', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context, {
      boundToken: 'read:nodes write:create-node',
    });

    const createPayload = JSON.stringify({
      id: 'node-wit-1',
      type: 'document',
      properties: { title: 'WIT Document' },
    });

    const createResult = await hostBindings.mutations.createNode(
      'write:create-node',
      createPayload,
    );
    expect(createResult.ok).toBe(true);
    if (createResult.ok) {
      const node = JSON.parse(createResult.value) as { id: string; type: string };
      expect(node.id).toBe('node-wit-1');
      expect(node.type).toBe('document');
    }

    const queryPayload = JSON.stringify({ id: 'node-wit-1' });
    const queryResult = await hostBindings.queries.queryNodes('read:nodes', queryPayload);
    expect(queryResult.ok).toBe(true);
    if (!queryResult.ok) return;
    const nodes = JSON.parse(queryResult.value) as readonly {
      id: string;
      properties: { title: string };
    }[];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.properties.title).toBe('WIT Document');
  });

  it('executes edge creation and deletion mutations via host bindings', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context, {
      boundToken: 'write:create-node write:create-edge write:delete-edge',
    });

    await hostBindings.mutations.createNode(
      'write:create-node',
      JSON.stringify({ id: 'n1', type: 'doc', properties: {} }),
    );
    await hostBindings.mutations.createNode(
      'write:create-node',
      JSON.stringify({ id: 'n2', type: 'doc', properties: {} }),
    );

    const edgePayload = JSON.stringify({
      id: 'e1',
      type: 'links',
      source: 'n1',
      target: 'n2',
      properties: {},
    });

    const createEdgeResult = await hostBindings.mutations.createEdge(
      'write:create-edge',
      edgePayload,
    );
    expect(createEdgeResult.ok).toBe(true);

    const deleteEdgeResult = await hostBindings.mutations.deleteEdge(
      'write:delete-edge',
      JSON.stringify({ id: 'e1' }),
    );
    expect(deleteEdgeResult.ok).toBe(true);
  });

  it('preserves every query, mutation, and event host operation', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context, {
      boundToken:
        'read:nodes read:edges read:properties read:traversal read:events write:create-node write:create-edge write:update-properties write:delete-edge write:delete-node',
    });

    const firstNode = JSON.stringify({
      id: 'operation-node-1',
      type: 'doc',
      properties: { title: 'first' },
    });
    const secondNode = JSON.stringify({
      id: 'operation-node-2',
      type: 'doc',
      properties: { title: 'second' },
    });
    await expectHostSuccess(hostBindings.mutations.createNode('write:create-node', firstNode));
    await expectHostSuccess(hostBindings.mutations.createNode('write:create-node', secondNode));

    const edgePayload = JSON.stringify({
      id: 'operation-edge-1',
      type: 'links',
      source: 'operation-node-1',
      target: 'operation-node-2',
      properties: { relation: 'related' },
    });
    await expectHostSuccess(hostBindings.mutations.createEdge('write:create-edge', edgePayload));

    await expectHostSuccess(hostBindings.queries.queryEdges('read:edges', '{}'));
    await expectHostSuccess(
      hostBindings.queries.lookupProperties(
        'read:properties',
        JSON.stringify({ entityId: 'operation-node-1', propertyKey: 'title' }),
      ),
    );
    await expectHostSuccess(
      hostBindings.queries.traverseGraph(
        'read:traversal',
        JSON.stringify({ startNodeIds: ['operation-node-1'], direction: 'out' }),
      ),
    );
    await expectHostSuccess(hostBindings.events.subscribeEvents('read:events', '{}'));
    await expectHostSuccess(
      hostBindings.events.replayEvents(
        'read:events',
        JSON.stringify({
          tenantId: '',
          graphId,
          lastSeenEventId: '',
          maxReplayCount: 100,
        }),
      ),
    );

    await expectHostSuccess(
      hostBindings.mutations.updateNodeProperties(
        'write:update-properties',
        JSON.stringify({ id: 'operation-node-1', properties: { title: 'updated' } }),
      ),
    );
    await expectHostSuccess(
      hostBindings.mutations.deleteEdge(
        'write:delete-edge',
        JSON.stringify({ id: 'operation-edge-1' }),
      ),
    );
    await expectHostSuccess(
      hostBindings.mutations.deleteNode(
        'write:delete-node',
        JSON.stringify({ id: 'operation-node-2' }),
      ),
    );
  });

  it('rejects calls when capability token does not grant required scope', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context, { boundToken: 'read:edges' });

    const result = await hostBindings.queries.queryNodes('read:edges', JSON.stringify({}));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('PermissionDenied');
    expect(result.error.message).toContain('read:nodes');
  });

  it('enforces the load-time bound token over the guest-supplied argument', async () => {
    const { context } = await setupTestContext();
    // Bound scope grants only reads; the guest supplies a broad write token.
    const hostBindings = createWasmHostBindings(context, { boundToken: 'read:*' });

    const readResult = await hostBindings.queries.queryNodes('*', JSON.stringify({}));
    expect(readResult.ok).toBe(true);

    const writeResult = await hostBindings.mutations.createNode(
      '*',
      JSON.stringify({ id: 'blocked', type: 'doc', properties: {} }),
    );
    expect(writeResult.ok).toBe(false);
    if (writeResult.ok) {
      return;
    }

    expect(writeResult.error.code).toBe('PermissionDenied');
    expect(writeResult.error.message).toContain('write:create-node');
  });

  it('fails closed with PermissionDenied when boundToken is omitted or empty', async () => {
    const { context } = await setupTestContext();
    const hostBindingsNoOptions = createWasmHostBindings(context);
    const queryResult = await hostBindingsNoOptions.queries.queryNodes(
      'read:nodes',
      JSON.stringify({}),
    );
    expect(queryResult.ok).toBe(false);
    if (queryResult.ok) return;
    expect(queryResult.error.code).toBe('PermissionDenied');
    expect(queryResult.error.message).toContain('bound');

    const hostBindingsEmptyToken = createWasmHostBindings(context, {
      boundToken: ' '.repeat(3),
    });
    const mutationResult = await hostBindingsEmptyToken.mutations.createNode(
      'write:create-node',
      JSON.stringify({ id: 'node-empty-token', type: 'doc', properties: {} }),
    );
    expect(mutationResult.ok).toBe(false);
    if (mutationResult.ok) return;
    expect(mutationResult.error.code).toBe('PermissionDenied');
    expect(mutationResult.error.message).toContain('bound');
  });

  it('rejects caller-supplied token overrides across the guest ABI', async () => {
    const { context } = await setupTestContext();
    // Host only granted read:nodes in closure-bound token
    const hostBindings = createWasmHostBindings(context, { boundToken: 'read:nodes' });

    // Guest attempts to forge write:create-node across ABI
    const forgedResult1 = await hostBindings.mutations.createNode(
      'write:create-node',
      JSON.stringify({ id: 'forged-node-1', type: 'doc', properties: {} }),
    );
    expect(forgedResult1.ok).toBe(false);
    if (forgedResult1.ok) return;
    expect(forgedResult1.error.code).toBe('PermissionDenied');
    expect(forgedResult1.error.message).toContain('write:create-node');

    // Guest attempts to forge * across ABI
    const forgedResult2 = await hostBindings.mutations.createNode(
      '*',
      JSON.stringify({ id: 'forged-node-2', type: 'doc', properties: {} }),
    );
    expect(forgedResult2.ok).toBe(false);
    if (forgedResult2.ok) return;
    expect(forgedResult2.error.code).toBe('PermissionDenied');
    expect(forgedResult2.error.message).toContain('write:create-node');
  });

  it('rejects wildcard tokens in boundToken for sensitive write capabilities', async () => {
    const { context } = await setupTestContext();
    // Bound token has write:*, which does not satisfy sensitive write capabilities
    const hostBindingsCategoryWildcard = createWasmHostBindings(context, {
      boundToken: 'write:*',
    });
    const writeResult1 = await hostBindingsCategoryWildcard.mutations.createNode(
      'write:create-node',
      JSON.stringify({ id: 'blocked-wildcard-1', type: 'doc', properties: {} }),
    );
    expect(writeResult1.ok).toBe(false);
    if (writeResult1.ok) return;
    expect(writeResult1.error.code).toBe('PermissionDenied');
    expect(writeResult1.error.message).toContain('write:create-node');

    // Bound token has global *, which also does not satisfy sensitive write capabilities
    const hostBindingsGlobalWildcard = createWasmHostBindings(context, {
      boundToken: '*',
    });
    const writeResult2 = await hostBindingsGlobalWildcard.mutations.createNode(
      'write:create-node',
      JSON.stringify({ id: 'blocked-wildcard-2', type: 'doc', properties: {} }),
    );
    expect(writeResult2.ok).toBe(false);
    if (writeResult2.ok) return;
    expect(writeResult2.error.code).toBe('PermissionDenied');
    expect(writeResult2.error.message).toContain('write:create-node');
  });

  it('returns VALIDATION_ERROR when payload is invalid JSON', async () => {
    const { context } = await setupTestContext();
    const hostBindings = createWasmHostBindings(context, { boundToken: 'read:nodes' });

    const result = await hostBindings.queries.queryNodes('read:nodes', '{ bad json }');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('ValidationError');
    expect(result.error.message).toContain('Invalid JSON');
  });

  it('consumes fuel on host import calls and returns ResourceExhausted when depleted', async () => {
    const { context } = await setupTestContext();
    const fuelMeter = createFuelMeter(150n);
    const hostBindings = createWasmHostBindings(context, {
      boundToken: 'read:nodes',
      fuelMeter,
      defaultFuelPerImport: 100n,
    });

    const firstResult = await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
    expect(firstResult.ok).toBe(true);
    expect(fuelMeter.remaining()).toBe(50n);

    const secondResult = await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
    expect(secondResult.ok).toBe(false);
    if (secondResult.ok) {
      return;
    }

    expect(secondResult.error.code).toBe('ResourceExhausted');
    expect(secondResult.error.message).toContain('fuel');
  });

  it('uses 100 fuel units per import by default', async () => {
    const { context } = await setupTestContext();
    const fuelMeter = createFuelMeter(100n);
    const hostBindings = createWasmHostBindings(context, {
      boundToken: 'read:nodes',
      fuelMeter,
    });

    const firstResult = await hostBindings.queries.queryNodes('read:nodes', '{}');
    expect(firstResult.ok).toBe(true);
    expect(fuelMeter.remaining()).toBe(0n);
    const secondResult = await hostBindings.queries.queryNodes('read:nodes', '{}');
    expect(secondResult.ok).toBe(false);
  });

  it('honors an explicit per-import fuel override independently of total fuel', async () => {
    const { context } = await setupTestContext();
    const fuelMeter = createFuelMeter(50n);
    const hostBindings = createWasmHostBindings(context, {
      boundToken: 'read:nodes',
      fuelMeter,
      defaultFuelPerImport: 25n,
    });

    const firstOverrideResult = await hostBindings.queries.queryNodes('read:nodes', '{}');
    expect(firstOverrideResult.ok).toBe(true);
    expect(fuelMeter.remaining()).toBe(25n);
    const secondOverrideResult = await hostBindings.queries.queryNodes('read:nodes', '{}');
    expect(secondOverrideResult.ok).toBe(true);
    expect(fuelMeter.remaining()).toBe(0n);
  });

  it('prevents reentrant host import calls', async () => {
    const { context } = await setupTestContext();
    const reentrancyGuard = createReentrancyGuard();

    const hostBindings = createWasmHostBindings(context, {
      boundToken: 'read:nodes',
      reentrancyGuard,
    });

    reentrancyGuard.enter();

    const result = await hostBindings.queries.queryNodes('read:nodes', JSON.stringify({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PermissionDenied');
      expect(result.error.message).toContain('Reentrant');
    }

    reentrancyGuard.exit();
  });
});
