import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  asDeviceId,
  asGraphId,
  createDeviceId,
  createEventId,
  createGraph,
  createGraphSession,
  createInstant,
  unwrap,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { Temporal } from 'temporal-polyfill';
import { createApiAdapterContext } from '../src/api-context';
import { IPC_METHODS, createIpcServer } from '../src/ipc';
import type { IpcServer } from '../src/ipc';

const getSocketPath = (): string =>
  path.join(
    process.cwd(),
    'tmp',
    `test-ipc-draft-${Temporal.Now.instant().epochMilliseconds}-${Math.random().toString(36).slice(2, 7)}.sock`,
  );

type JsonRpcLine = Readonly<{
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: unknown;
  error?: Readonly<{ code: number; message: string; data?: unknown }>;
  method?: string;
  params?: Readonly<Record<string, unknown>>;
}>;

// Minimal NDJSON line reassembly for a raw net.Socket, mirroring the framing both ipc-server.ts and
// apps/cli/src/ipc/ipc-client.ts use on the wire (see ipc-server-streaming.load.test.ts).
const onEachLine = (socket: net.Socket, handleLine: (line: JsonRpcLine) => void): void => {
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        handleLine(JSON.parse(line) as JsonRpcLine);
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });
};

const connectSocket = async (socketPath: string): Promise<net.Socket> => {
  const client = net.connect(socketPath);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  return client;
};

// A tiny JSON-RPC test client over a raw socket: tracks pending requests by id and resolves them as
// matching response lines arrive.
type RpcClient = Readonly<{
  socket: net.Socket;
  call: (method: string, parameters: unknown) => Promise<JsonRpcLine>;
}>;

const createRpcClient = async (socketPath: string): Promise<RpcClient> => {
  const socket = await connectSocket(socketPath);
  const pending = new Map<number, (line: JsonRpcLine) => void>();
  let nextId = 1;
  onEachLine(socket, (line) => {
    if (!(typeof line.id === 'number' && pending.has(line.id))) {
      return;
    }

    pending.get(line.id)?.(line);
    pending.delete(line.id);
  });
  const call = (method: string, parameters: unknown): Promise<JsonRpcLine> => {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', method, params: parameters, id })}\n`);
    });
  };
  return { socket, call };
};

// Builds a wire-level (pre-transform) NodeCreated event payload: plain strings, exactly what a
// draft.apply client sends over JSON-RPC before GraphEventSchema parses/brands the fields.
const nodeCreatedEvent = (
  id: string,
  nodeType = 'concept',
  properties?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  type: 'NodeCreated',
  eventId: createEventId(),
  id,
  nodeType,
  properties: properties ?? { title: id },
  timestamp: createInstant(),
  deviceId: createDeviceId(),
});

const expectSessionRequired = (line: JsonRpcLine): void => {
  expect(line.error).toBeDefined();
  expect(line.error?.code).toBe(-32_000);
  expect((line.error?.data as Readonly<{ type: string }>).type).toBe('unauthorized');
};

const waitUntil = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Temporal.Now.instant().epochMilliseconds;
  while (!predicate()) {
    if (Temporal.Now.instant().epochMilliseconds - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('canopy.v1.draft.* JSON-RPC flow', () => {
  let server: IpcServer | undefined;
  let socketPath: string;

  beforeEach(() => {
    socketPath = getSocketPath();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    if (fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // Ignore
      }
    }
  });

  it('8.1 happy path: create -> apply -> preview (parent unchanged) -> commit -> visible via query', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_draft_happy');
    const deviceId = asDeviceId('dev_draft_happy');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();
    const rpc = await createRpcClient(socketPath);

    const createResp = await rpc.call(IPC_METHODS.DRAFT_CREATE, {});
    expect(createResp.error).toBeUndefined();
    const { draftId, parentRevision } = createResp.result as Readonly<{
      draftId: string;
      parentRevision: string;
    }>;
    expect(draftId).toBeTruthy();
    expect(parentRevision).toBeTruthy();

    const nodeId = 'node_draft_happy_1';
    const applyResp = await rpc.call(IPC_METHODS.DRAFT_APPLY, {
      draftId,
      events: [nodeCreatedEvent(nodeId)],
    });
    expect(applyResp.error).toBeUndefined();
    expect((applyResp.result as Readonly<{ staged: number }>).staged).toBe(1);

    const previewResp = await rpc.call(IPC_METHODS.DRAFT_PREVIEW, { draftId });
    expect(previewResp.error).toBeUndefined();
    const preview = previewResp.result as Readonly<{
      counts: Readonly<{ created: number; updated: number; deleted: number }>;
      touchedNodeIds: readonly string[];
      truncated: boolean;
    }>;
    expect(preview.counts.created).toBe(1);
    expect(preview.touchedNodeIds).toContain(nodeId);
    expect(preview.truncated).toBe(false);

    // Parent graph is unchanged while the draft is only staged, not committed.
    const preCommitQuery = await rpc.call(IPC_METHODS.QUERY_GET_NODE, { id: nodeId });
    expect(preCommitQuery.error).toBeDefined();

    const commitResp = await rpc.call(IPC_METHODS.DRAFT_COMMIT, {
      draftId,
      expectedParentRevision: parentRevision,
    });
    expect(commitResp.error).toBeUndefined();

    const postCommitQuery = await rpc.call(IPC_METHODS.QUERY_GET_NODE, { id: nodeId });
    expect(postCommitQuery.error).toBeUndefined();
    expect((postCommitQuery.result as Readonly<{ id: string }>).id).toBe(nodeId);

    rpc.socket.destroy();
  });

  it('8.2 concurrent-modification: enriched error carries current revision; draft stays usable and re-commits', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_draft_conflict');
    const deviceId = asDeviceId('dev_draft_conflict');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();
    const rpc = await createRpcClient(socketPath);

    const createResp = await rpc.call(IPC_METHODS.DRAFT_CREATE, {});
    const { draftId, parentRevision: staleParentRevision } = createResp.result as Readonly<{
      draftId: string;
      parentRevision: string;
    }>;

    const applyResp = await rpc.call(IPC_METHODS.DRAFT_APPLY, {
      draftId,
      events: [nodeCreatedEvent('node_draft_conflict_1')],
    });
    expect(applyResp.error).toBeUndefined();

    // Mutate the parent out-of-band via a normal mutation call on a second connection, advancing
    // graph.metadata.modified independently of the draft.
    const outOfBand = await createRpcClient(socketPath);
    const outOfBandResp = await outOfBand.call(IPC_METHODS.MUTATION_CREATE_NODE, {
      id: 'node_draft_conflict_out_of_band',
      type: 'concept',
      properties: { title: 'out of band' },
    });
    expect(outOfBandResp.error).toBeUndefined();
    outOfBand.socket.destroy();

    const staleCommitResp = await rpc.call(IPC_METHODS.DRAFT_COMMIT, {
      draftId,
      expectedParentRevision: staleParentRevision,
    });
    expect(staleCommitResp.error).toBeDefined();
    expect(staleCommitResp.error?.code).toBe(-32_000);
    const errorData = staleCommitResp.error?.data as Readonly<{
      type: string;
      currentParentRevision?: string;
    }>;
    expect(errorData.type).toBe('concurrent-modification');
    expect(errorData.currentParentRevision).toBeTruthy();
    expect(errorData.currentParentRevision).not.toBe(staleParentRevision);

    // The draft is still active: a fresh preview still shows the staged change.
    const previewResp = await rpc.call(IPC_METHODS.DRAFT_PREVIEW, { draftId });
    expect(previewResp.error).toBeUndefined();
    expect(
      (previewResp.result as Readonly<{ counts: Readonly<{ created: number }> }>).counts.created,
    ).toBe(1);

    const retryCommitResp = await rpc.call(IPC_METHODS.DRAFT_COMMIT, {
      draftId,
      expectedParentRevision: errorData.currentParentRevision,
    });
    expect(retryCommitResp.error).toBeUndefined();

    rpc.socket.destroy();
  });

  it('8.3 validation-failure: draft.apply rejects an invalid batch and leaves the draft unchanged', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_draft_invalid');
    const deviceId = asDeviceId('dev_draft_invalid');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();
    const rpc = await createRpcClient(socketPath);

    const createResp = await rpc.call(IPC_METHODS.DRAFT_CREATE, {});
    const { draftId } = createResp.result as Readonly<{ draftId: string }>;

    // Two NodeCreated events in the same batch targeting the same node id: structurally valid
    // GraphEvents, but semantically invalid (duplicate node), so applyDraftEvents/projectGraph
    // rejects the batch as a whole -- draft-session.ts surfaces this as 'validation-failure'.
    const duplicateId = 'node_draft_invalid_dup';
    const applyResp = await rpc.call(IPC_METHODS.DRAFT_APPLY, {
      draftId,
      events: [nodeCreatedEvent(duplicateId), nodeCreatedEvent(duplicateId)],
    });
    expect(applyResp.error).toBeDefined();
    expect(applyResp.error?.code).toBe(-32_000);
    const errorData = applyResp.error?.data as Readonly<{ type: string }>;
    expect(errorData.type).toBe('validation-failure');

    const previewResp = await rpc.call(IPC_METHODS.DRAFT_PREVIEW, { draftId });
    expect(previewResp.error).toBeUndefined();
    const preview = previewResp.result as Readonly<{
      counts: Readonly<{ created: number; updated: number; deleted: number }>;
    }>;
    expect(preview.counts.created).toBe(0);
    expect(preview.counts.updated).toBe(0);
    expect(preview.counts.deleted).toBe(0);

    rpc.socket.destroy();
  });

  it('8.4 bounded preview: touched-id lists are capped with truncated=true, response stays small', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_draft_bounded');
    const deviceId = asDeviceId('dev_draft_bounded');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();
    const rpc = await createRpcClient(socketPath);

    const createResp = await rpc.call(IPC_METHODS.DRAFT_CREATE, {});
    const { draftId } = createResp.result as Readonly<{ draftId: string }>;

    const eventCount = 250; // above the 200 touched-id cap, below the 500 staged-events cap
    const events = Array.from({ length: eventCount }, (_unused, index) =>
      nodeCreatedEvent(`node_draft_bounded_${index}`),
    );
    const applyResp = await rpc.call(IPC_METHODS.DRAFT_APPLY, { draftId, events });
    expect(applyResp.error).toBeUndefined();
    expect((applyResp.result as Readonly<{ staged: number }>).staged).toBe(eventCount);

    const previewResp = await rpc.call(IPC_METHODS.DRAFT_PREVIEW, { draftId });
    expect(previewResp.error).toBeUndefined();
    const preview = previewResp.result as Readonly<{
      counts: Readonly<{ created: number }>;
      touchedNodeIds: readonly string[];
      truncated: boolean;
    }>;
    expect(preview.counts.created).toBe(eventCount);
    expect(preview.touchedNodeIds.length).toBe(200);
    expect(preview.truncated).toBe(true);

    // Never serializes the full graph -- stays well under the server's 10MB per-line cap.
    const approximateResponseBytes = Buffer.byteLength(JSON.stringify(previewResp), 'utf8');
    expect(approximateResponseBytes).toBeLessThan(1024 * 1024);

    rpc.socket.destroy();
  });

  it('8.5 cleanup on disconnect: a closed connection frees its drafts', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_draft_cleanup');
    const deviceId = asDeviceId('dev_draft_cleanup');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();
    const rpc = await createRpcClient(socketPath);

    const createResp = await rpc.call(IPC_METHODS.DRAFT_CREATE, {});
    const { draftId } = createResp.result as Readonly<{ draftId: string }>;
    const applyResp = await rpc.call(IPC_METHODS.DRAFT_APPLY, {
      draftId,
      events: [nodeCreatedEvent('node_draft_cleanup_1')],
    });
    expect(applyResp.error).toBeUndefined();

    rpc.socket.destroy();
    await waitUntil(() => server?.getActiveConnectionCount() === 0);

    const freshRpc = await createRpcClient(socketPath);
    const previewOnFresh = await freshRpc.call(IPC_METHODS.DRAFT_PREVIEW, { draftId });
    expect(previewOnFresh.error).toBeDefined();
    expect(previewOnFresh.error?.code).toBe(-32_000);
    expect((previewOnFresh.error?.data as Readonly<{ type: string }>).type).toBe('draft-not-found');

    freshRpc.socket.destroy();
  });

  it('8.6 limits: exceeding the per-connection draft cap and the staged-events cap both return domain errors', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_draft_limits');
    const deviceId = asDeviceId('dev_draft_limits');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();
    const rpc = await createRpcClient(socketPath);

    // MAX_DRAFTS_PER_CONNECTION is 10 (packages/api-adapter/src/ipc/ipc-handlers.ts); create one
    // over the cap and confirm the last one is rejected rather than growing the registry unbounded.
    const maxDraftsPerConnection = 10;

    for (let index = 0; index < maxDraftsPerConnection; index += 1) {
      const resp = await rpc.call(IPC_METHODS.DRAFT_CREATE, {});
      expect(resp.error).toBeUndefined();
    }
    const overCapResp = await rpc.call(IPC_METHODS.DRAFT_CREATE, {});
    expect(overCapResp.error).toBeDefined();
    expect(overCapResp.error?.code).toBe(-32_000);
    const overCapData = overCapResp.error?.data as Readonly<{ type: string; limit?: string }>;
    expect(overCapData.type).toBe('limit-exceeded');
    expect(overCapData.limit).toBe('per-connection');

    // Staged-events cap: use a second connection so the per-connection draft cap above doesn't
    // interfere with this check.
    const secondRpc = await createRpcClient(socketPath);
    const createResp = await secondRpc.call(IPC_METHODS.DRAFT_CREATE, {});
    const { draftId } = createResp.result as Readonly<{ draftId: string }>;

    // MAX_STAGED_EVENTS_PER_DRAFT is 500; one apply call staging 501 events must be rejected wholesale.
    const overStagedCapEvents = Array.from({ length: 501 }, (_unused, index) =>
      nodeCreatedEvent(`node_draft_limits_${index}`),
    );
    const overStagedResp = await secondRpc.call(IPC_METHODS.DRAFT_APPLY, {
      draftId,
      events: overStagedCapEvents,
    });
    expect(overStagedResp.error).toBeDefined();
    expect(overStagedResp.error?.code).toBe(-32_000);
    const overStagedData = overStagedResp.error?.data as Readonly<{ type: string; limit?: string }>;
    expect(overStagedData.type).toBe('limit-exceeded');
    expect(overStagedData.limit).toBe('staged-events');

    // Rejected wholesale, not partially staged.
    const previewResp = await secondRpc.call(IPC_METHODS.DRAFT_PREVIEW, { draftId });
    expect(previewResp.error).toBeUndefined();
    expect(
      (previewResp.result as Readonly<{ counts: Readonly<{ created: number }> }>).counts.created,
    ).toBe(0);

    rpc.socket.destroy();
    secondRpc.socket.destroy();
  });

  it('8.7 missing-session: every draft.* method rejects a read-only context', async () => {
    const graph = unwrap(createGraph(asGraphId('graph_draft_readonly'), 'Readonly Graph'));
    const context = createApiAdapterContext({ graph });

    server = createIpcServer({ socketPath, context });
    await server.listen();
    const rpc = await createRpcClient(socketPath);

    expectSessionRequired(await rpc.call(IPC_METHODS.DRAFT_CREATE, {}));
    expectSessionRequired(
      await rpc.call(IPC_METHODS.DRAFT_APPLY, { draftId: 'draft_missing', events: [] }),
    );
    expectSessionRequired(await rpc.call(IPC_METHODS.DRAFT_PREVIEW, { draftId: 'draft_missing' }));
    expectSessionRequired(
      await rpc.call(IPC_METHODS.DRAFT_COMMIT, {
        draftId: 'draft_missing',
        expectedParentRevision: 'rev',
      }),
    );
    expectSessionRequired(await rpc.call(IPC_METHODS.DRAFT_DISCARD, { draftId: 'draft_missing' }));

    rpc.socket.destroy();
  });
});
