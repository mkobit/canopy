import { describe, expect, it } from 'bun:test';
import type { IpcClient, IpcClientError } from '@canopy/api-adapter';
import { Effect } from 'effect';
import { createClipHost } from '../src/host';
import { createRateLimiter } from '../src/rate-limiter';

const WEBCLIP_TYPE_ID = 'node_webclip_type';

/** A stub IpcClient that records every call so tests can assert what was (and wasn't) relayed. */
const createStubClient = (): Readonly<{ client: IpcClient; calls: string[] }> => {
  const calls: string[] = [];
  const record = <T>(name: string, value: T): Effect.Effect<T, IpcClientError> => {
    calls.push(name);
    return Effect.succeed(value);
  };

  const client: IpcClient = {
    handshake: () =>
      record('handshake', { apiVersion: 'v1', serverVersion: '0.1.0', capabilities: [] }),
    getNode: () => record('getNode', {} as never),
    getNodes: () =>
      record('getNodes', [
        {
          id: WEBCLIP_TYPE_ID,
          type: 'node:type:node-type',
          properties: { name: 'WebClip', namespace: 'clip' },
          createdAt: '',
          updatedAt: '',
        },
      ] as never),
    getEdge: () => record('getEdge', {} as never),
    getEdges: () => record('getEdges', [] as never),
    executeQuery: () => record('executeQuery', [] as never),
    createNode: (parameters) => record('createNode', parameters as never),
    updateNodeProperties: () => record('updateNodeProperties', {} as never),
    deleteNode: () => record('deleteNode', { id: 'x' }),
    createEdge: () => record('createEdge', {} as never),
    deleteEdge: () => record('deleteEdge', { id: 'x' }),
    subscribe: () => record('subscribe', { subscriptionId: 'sub_1' }),
    unsubscribe: () => record('unsubscribe', { success: true }),
    draftCreate: () => record('draftCreate', { draftId: 'draft_1', parentRevision: 'rev_1' }),
    draftApply: (parameters) => record('draftApply', parameters as never),
    draftPreview: () =>
      record('draftPreview', {
        parentRevision: 'rev_1',
        counts: { created: 0, updated: 0, deleted: 0 },
        touchedNodeIds: [],
        touchedEdgeIds: [],
        truncated: false,
      }),
    draftCommit: () => record('draftCommit', { success: true }),
    draftDiscard: () => record('draftDiscard', { success: true }),
    close: () => Effect.void,
  };

  return { client, calls };
};

describe('clip-host allowlist enforcement', () => {
  it('7.2 relays an allowlisted handshake call', async () => {
    const { client, calls } = createStubClient();
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(client),
    });

    const response = await host.handleRequest({ method: 'canopy.v1.handshake', id: 1 });
    expect(response.error).toBeUndefined();
    expect(calls).toContain('handshake');
  });

  it('7.2 rejects an out-of-allowlist method and never reaches the stub daemon', async () => {
    const { client, calls } = createStubClient();
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(client),
    });

    const response = await host.handleRequest({ method: 'canopy.v1.mutation.deleteNode', id: 1 });
    expect(response.error).toBeDefined();
    expect(calls).toEqual([]);
  });

  it('7.2 rejects createNode outside the clip namespace and never reaches the stub daemon', async () => {
    const { client, calls } = createStubClient();
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(client),
    });

    const response = await host.handleRequest({
      method: 'canopy.v1.mutation.createNode',
      params: { type: 'some-other-type', properties: { title: 'not a clip' } },
      id: 1,
    });
    expect(response.error).toBeDefined();
    expect(calls).not.toContain('createNode');
  });

  it('7.2 relays createNode for the ensured WebClip type', async () => {
    const { client, calls } = createStubClient();
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(client),
    });

    const response = await host.handleRequest({
      method: 'canopy.v1.mutation.createNode',
      params: { type: WEBCLIP_TYPE_ID, properties: { title: 'a real clip' } },
      id: 1,
    });
    expect(response.error).toBeUndefined();
    expect(calls).toContain('getNodes');
    expect(calls).toContain('createNode');
  });

  it('7.2 rejects draft.apply staging an event for a type other than WebClip', async () => {
    const { client, calls } = createStubClient();
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(client),
    });

    const response = await host.handleRequest({
      method: 'canopy.v1.draft.apply',
      params: {
        draftId: 'draft_1',
        events: [{ type: 'NodeCreated', nodeType: 'some-other-type', properties: {} }],
      },
      id: 1,
    });
    expect(response.error).toBeDefined();
    expect(calls).not.toContain('draftApply');
  });

  it('3.5 (addendum) rejection carries the resolved webClipTypeId for the caller to retry with', async () => {
    const { client } = createStubClient();
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(client),
    });

    const response = await host.handleRequest({
      method: 'canopy.v1.draft.apply',
      params: {
        draftId: 'draft_1',
        events: [{ type: 'NodeCreated', nodeType: 'unknown-placeholder', properties: {} }],
      },
      id: 1,
    });
    expect(response.error).toBeDefined();
    expect(response.error?.data).toEqual({ webClipTypeId: WEBCLIP_TYPE_ID });
  });

  it('7.2 relays draft.create/preview/commit (no extra namespace check needed)', async () => {
    const { client, calls } = createStubClient();
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(client),
    });

    const createResponse = await host.handleRequest({ method: 'canopy.v1.draft.create', id: 1 });
    expect(createResponse.error).toBeUndefined();
    expect(calls).toContain('draftCreate');
  });

  it('3.6 (addendum) draft.apply relays plain-object properties, not a Map, to the wire client', async () => {
    const { client, calls } = createStubClient();
    let captured: unknown;
    const capturingClient: IpcClient = {
      ...client,
      draftApply: (parameters) => {
        captured = parameters;
        calls.push('draftApply');
        return Effect.succeed({ staged: 1 });
      },
    };
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(capturingClient),
    });

    const response = await host.handleRequest({
      method: 'canopy.v1.draft.apply',
      params: {
        draftId: 'draft_1',
        events: [
          {
            type: 'NodeCreated',
            eventId: crypto.randomUUID(),
            id: crypto.randomUUID(),
            nodeType: WEBCLIP_TYPE_ID,
            properties: { title: 'a real clip' },
            timestamp: '2026-08-11T12:00:00.000Z',
            deviceId: crypto.randomUUID(),
          },
        ],
      },
      id: 1,
    });
    expect(response.error).toBeUndefined();
    const sentProperties = (
      captured as Readonly<{ events: readonly Readonly<{ properties: unknown }>[] }>
    ).events[0]?.properties;
    // Regression: parsed.data.events[].properties (zod's transformed output) is a
    // Map, structurally still assignable to draftApply's wider (Map | Record)
    // input type -- so this compiled fine even when it silently JSON.stringify'd
    // to `{}` over a real socket. Asserting the *plain-object* shape here, not
    // just success, is the point.
    expect(sentProperties instanceof Map).toBe(false);
    expect(sentProperties).toEqual({ title: 'a real clip' });
  });

  it('3.6 (addendum) a relayed daemon error forwards error.data (e.g. concurrent-modification revision)', async () => {
    const { client } = createStubClient();
    const failingClient: IpcClient = {
      ...client,
      draftCommit: () =>
        Effect.fail({
          _tag: 'IpcClientError',
          code: -32_000,
          message: 'Draft commit failed: parent revision has advanced',
          details: { type: 'concurrent-modification', currentParentRevision: 'rev_2' },
        }),
    };
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () => Effect.succeed(failingClient),
    });

    const response = await host.handleRequest({
      method: 'canopy.v1.draft.commit',
      params: { draftId: 'draft_1', expectedParentRevision: 'rev_1' },
      id: 1,
    });
    expect(response.error?.data).toEqual({
      type: 'concurrent-modification',
      currentParentRevision: 'rev_2',
    });
  });
});
