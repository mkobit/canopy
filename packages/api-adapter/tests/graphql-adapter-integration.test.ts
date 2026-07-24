import { describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createApiAdapterContext } from '../src/api-context';
import { createGraphQLAdapter } from '../src/graphql/graphql-adapter';

const graphId = asGraphId('g1');
const deviceId = asDeviceId('device-1');

const setupTestContext = async () => {
  const store = createInMemoryEventStore();
  const session = createGraphSession(store, graphId, deviceId);
  await session.load();
  const graph = session.graph();
  return createApiAdapterContext({ graph, session, eventLogStore: store });
};

describe('GraphQL adapter end-to-end integration', () => {
  it('executes GraphQL query and mutation operations end-to-end', async () => {
    const ctx = await setupTestContext();
    const adapter = createGraphQLAdapter(ctx);

    const mutationRes = await adapter.execute({
      source: `
        mutation {
          createNode(input: { type: "system:nodetype:text-block", properties: { text: "Integration Note", content: [] } }) {
            id
            success
          }
        }
      `,
    });

    expect(mutationRes.errors).toBeUndefined();
    const mutationData = mutationRes.data as unknown as {
      readonly createNode: { readonly id: string; readonly success: boolean };
    };
    expect(mutationData.createNode.success).toBe(true);

    const queryRes = await adapter.execute({
      source: `
        query {
          nodes(type: "system:nodetype:text-block") {
            totalCount
            edges {
              node {
                type
              }
            }
          }
        }
      `,
    });

    expect(queryRes.errors).toBeUndefined();
    const queryData = queryRes.data as unknown as {
      readonly nodes: {
        readonly totalCount: number;
        readonly edges: readonly { readonly node: { readonly type: string } }[];
      };
    };
    expect(queryData.nodes.totalCount).toBeGreaterThan(0);
  });

  it('subscribes to GraphQL event stream operations end-to-end', async () => {
    const ctx = await setupTestContext();
    const adapter = createGraphQLAdapter(ctx);

    const subResult = await adapter.subscribe({
      source: `
        subscription {
          eventStream {
            kind
          }
        }
      `,
    });

    expect(isAsyncIterable(subResult)).toBe(true);
    if (isAsyncIterable(subResult)) {
      const iterator = subResult[Symbol.asyncIterator]();
      const nextPromise = iterator.next();

      await adapter.execute({
        source: `
          mutation {
            createNode(input: { type: "system:nodetype:text-block", properties: { text: "Subscribed Note", content: [] } }) {
              id
              success
            }
          }
        `,
      });

      const item = await nextPromise;
      expect(item.done).toBe(false);
      expect(item.value.data).toBeDefined();

      if (iterator.return) {
        await iterator.return();
      }
    }
  });
});

function isAsyncIterable<T>(obj: unknown): obj is AsyncIterable<T> {
  return obj != null && typeof (obj as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}
