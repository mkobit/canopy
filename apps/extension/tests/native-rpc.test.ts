import { describe, expect, it } from 'bun:test';
import {
  buildNodeCreatedEvent,
  createNativeRpcClient,
  extractConcurrentModificationRevision,
  extractRejectedTypeId,
  isDaemonUnavailable,
  type JsonRpcResponse,
} from '../src/shared/native-rpc';

describe('createNativeRpcClient', () => {
  it('resolves call() when a matching-id response arrives via handleIncoming', async () => {
    const sent: unknown[] = [];
    const client = createNativeRpcClient((message) => {
      sent.push(message);
    });

    const pending = client.call('canopy.v1.handshake', { clientVersion: '1' });
    const sentMessage = sent[0] as Readonly<{ id: number }>;
    client.handleIncoming({ jsonrpc: '2.0', id: sentMessage.id, result: { ok: true } });

    const response = await pending;
    expect(response.result).toEqual({ ok: true });
  });

  it('ignores a response with an unknown id', async () => {
    const client = createNativeRpcClient(() => undefined);
    client.handleIncoming({ jsonrpc: '2.0', id: 999, result: {} });
    // No pending call for id 999 -- nothing to assert beyond "did not throw".
    expect(true).toBe(true);
  });

  it('rejects every pending call when the port disconnects', async () => {
    const client = createNativeRpcClient(() => undefined);
    const first = client.call('canopy.v1.draft.create');
    const second = client.call('canopy.v1.draft.preview', { draftId: 'draft_1' });

    client.handleDisconnect('native host exited');

    await expect(first).rejects.toThrow('native host exited');
    await expect(second).rejects.toThrow('native host exited');
  });

  it('assigns distinct, monotonically increasing ids per call', () => {
    const sent: Readonly<{ id: number }>[] = [];
    const client = createNativeRpcClient((message) => {
      sent.push(message as Readonly<{ id: number }>);
    });
    void client.call('a');
    void client.call('b');
    expect(sent[0]?.id).toBeLessThan(sent[1]?.id ?? 0);
  });
});

describe('buildNodeCreatedEvent', () => {
  it('builds the exact wire shape a draft.apply client sends', () => {
    const event = buildNodeCreatedEvent({
      nodeType: 'node_webclip_type',
      properties: { title: 'A page' },
      eventId: 'evt-1',
      nodeId: 'node-1',
      timestamp: '2026-08-11T12:00:00.000Z',
      deviceId: 'device-1',
    });
    expect(event).toEqual({
      type: 'NodeCreated',
      eventId: 'evt-1',
      id: 'node-1',
      nodeType: 'node_webclip_type',
      properties: { title: 'A page' },
      timestamp: '2026-08-11T12:00:00.000Z',
      deviceId: 'device-1',
    });
  });
});

describe('extractRejectedTypeId', () => {
  it('extracts the resolved id from a NAMESPACE_REJECTED response', () => {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32_002, message: 'rejected', data: { webClipTypeId: 'node_real_type' } },
    };
    expect(extractRejectedTypeId(response)).toBe('node_real_type');
  });

  it('returns undefined for an unrelated error code', () => {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32_001, message: 'method not allowed' },
    };
    expect(extractRejectedTypeId(response)).toBeUndefined();
  });
});

describe('extractConcurrentModificationRevision', () => {
  it('extracts the fresh parent revision from a concurrent-modification error', () => {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32_000,
        message: 'Draft commit failed: parent revision has advanced',
        data: { type: 'concurrent-modification', currentParentRevision: 'rev_2' },
      },
    };
    expect(extractConcurrentModificationRevision(response)).toBe('rev_2');
  });

  it('returns undefined for a domain error of a different type', () => {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32_000,
        message: 'some other domain error',
        data: { type: 'draft-not-found' },
      },
    };
    expect(extractConcurrentModificationRevision(response)).toBeUndefined();
  });
});

describe('isDaemonUnavailable', () => {
  it('recognizes the clip-host DAEMON_UNAVAILABLE code', () => {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32_004, message: 'daemon unavailable' },
    };
    expect(isDaemonUnavailable(response)).toBe(true);
  });

  it('returns false for a success response', () => {
    const response: JsonRpcResponse = { jsonrpc: '2.0', id: 1, result: {} };
    expect(isDaemonUnavailable(response)).toBe(false);
  });
});
