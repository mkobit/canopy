import { describe, expect, it } from 'bun:test';
import {
  createEventBus,
  asDeviceId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraphSession,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import { createSubscriptionResolvers } from '../src/graphql/resolvers/subscriptions';
import { executeCreateNode } from '../src/mutation-handlers';
import { createApiRequest } from '../src/api-payloads';

const graphId = asGraphId('g1');
const deviceId = asDeviceId('device-1');

const setupTestContext = async () => {
  const store = createInMemoryEventStore();
  const session = createGraphSession(store, graphId, deviceId);
  await session.load();
  const graph = session.graph();
  return { context: createApiAdapterContext({ graph, session, eventLogStore: store }), session };
};

describe('GraphQL subscription resolvers', () => {
  it('creates an eventStream subscription async iterator', async () => {
    const eventBus = createEventBus();
    const { context } = await setupTestContext();
    const resolvers = createSubscriptionResolvers(context, eventBus);
    const sub = resolvers.eventStream.subscribe(null, { bufferCapacity: 10 });
    expect(sub[Symbol.asyncIterator]).toBeDefined();
  });

  it('streams graph events via async iterator when nodes are created', async () => {
    const { context } = await setupTestContext();
    const resolvers = createSubscriptionResolvers(context);
    const sub = resolvers.eventStream.subscribe(null, { bufferCapacity: 10 });
    const iterator = sub[Symbol.asyncIterator]();

    const req = createApiRequest('req-1', context, {
      id: asNodeId('n-sub-1'),
      type: asTypeId('doc'),
      properties: { title: 'Subscribed Node' },
    });

    const createPromise = executeCreateNode(req);
    const nextPromise = iterator.next();

    await createPromise;
    const result = await nextPromise;

    expect(result.done).toBe(false);
    expect(result.value).toBeDefined();
    expect(result.value.eventStream.kind).toBe('event');
    expect(result.value.eventStream.event?.id).toBe(asNodeId('n-sub-1'));

    await iterator.return();
  });

  it('cleans up subscription when return is called', async () => {
    const { context } = await setupTestContext();
    const resolvers = createSubscriptionResolvers(context);
    const sub = resolvers.eventStream.subscribe(null, { bufferCapacity: 10 });
    const iterator = sub[Symbol.asyncIterator]();

    const returnResult = await iterator.return();
    expect(returnResult.done).toBe(true);

    const nextResult = await iterator.next();
    expect(nextResult.done).toBe(true);
  });
});
