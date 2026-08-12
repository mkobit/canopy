import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { IpcServer } from '@canopy/api-adapter';
import { createApiAdapterContext, createIpcServer } from '@canopy/api-adapter';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createClipHost } from '../src/host';
import { createRateLimiter } from '../src/rate-limiter';

const getSocketPath = (): string =>
  path.join(
    process.cwd(),
    'tmp',
    `test-clip-host-extension-e2e-${Math.random().toString(36).slice(2, 9)}.sock`,
  );

// A wire-shaped NodeCreated event, matching what apps/extension/src/shared/native-rpc.ts's
// buildNodeCreatedEvent sends -- constructed inline here since this test simulates the
// extension's own request sequence against a real host + daemon, not apps/extension's
// browser-only code (which can't run under Bun without heavy chrome.* mocking).
const buildClipEvent = (nodeType: string, nodeId: string): Readonly<Record<string, unknown>> => ({
  type: 'NodeCreated',
  eventId: crypto.randomUUID(),
  id: nodeId,
  nodeType,
  properties: {
    title: 'Example page',
    sourceUrl: 'https://example.com/article',
    content: 'the captured clip content',
    capturedAt: '2026-08-11T12:00:00.000Z',
  },
  timestamp: '2026-08-11T12:00:00.000Z',
  deviceId: crypto.randomUUID(),
});

describe('extension capture -> commit -> query (7.5)', () => {
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

  it('stages, previews, retries on the discovered type id, commits, and the WebClip node is then queryable', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_extension_e2e_test');
    const deviceId = asDeviceId('dev_extension_e2e_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    const listenResponse = await server.listen();
    expect(listenResponse.ok).toBe(true);

    const host = createClipHost({
      socketPath,
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
    });

    // 1. draft.create
    const created = await host.handleRequest({ method: 'canopy.v1.draft.create', id: 1 });
    expect(created.error).toBeUndefined();
    const { draftId, parentRevision } = created.result as Readonly<{
      draftId: string;
      parentRevision: string;
    }>;

    const nodeId = crypto.randomUUID();

    // 2. First draft.apply attempt: the extension doesn't know the real WebClip
    // type id yet on a cold start, so it guesses -- expect NAMESPACE_REJECTED,
    // carrying the now-ensured real id (apps/clip-host/src/host.ts's addendum).
    const firstApply = await host.handleRequest({
      method: 'canopy.v1.draft.apply',
      params: { draftId, events: [buildClipEvent('pending-webclip-type', nodeId)] },
      id: 2,
    });
    expect(firstApply.error).toBeDefined();
    const webClipTypeId = (firstApply.error?.data as Readonly<{ webClipTypeId: unknown }>)
      .webClipTypeId;
    expect(typeof webClipTypeId).toBe('string');

    // 3. Retry the same draft.apply with the discovered type id.
    const retryApply = await host.handleRequest({
      method: 'canopy.v1.draft.apply',
      params: { draftId, events: [buildClipEvent(webClipTypeId as string, nodeId)] },
      id: 3,
    });
    expect(retryApply.error).toBeUndefined();
    expect(retryApply.result).toEqual({ staged: 1 });

    // 4. draft.preview shows the staged node while the parent graph is unchanged.
    const preview = await host.handleRequest({
      method: 'canopy.v1.draft.preview',
      params: { draftId },
      id: 4,
    });
    expect(preview.error).toBeUndefined();
    const previewResult = preview.result as Readonly<{
      counts: Readonly<{ created: number }>;
      touchedNodeIds: readonly string[];
    }>;
    expect(previewResult.counts.created).toBe(1);
    expect(previewResult.touchedNodeIds).toContain(nodeId);

    const beforeCommit = await host.handleRequest({
      method: 'canopy.v1.query.getNodes',
      params: { type: webClipTypeId },
      id: 5,
    });
    expect(beforeCommit.error).toBeUndefined();
    expect(beforeCommit.result).toEqual([]);

    // 5. draft.commit -- expected to hit concurrent-modification on the very
    // first-ever clip: draft.create's parentRevision was captured before
    // ensureWebClipType's own internal namespace/type-authoring commit (a
    // side effect of the earlier namespace-narrowed draft.apply attempts)
    // advanced the parent graph. This is exactly the re-preview/retry path
    // apps/extension/src/background/service-worker.ts's commitWithRetry
    // implements for tasks.md 6.5 -- exercised here for real, not mocked.
    const firstCommit = await host.handleRequest({
      method: 'canopy.v1.draft.commit',
      params: { draftId, expectedParentRevision: parentRevision },
      id: 6,
    });
    expect(firstCommit.error?.message).toContain('parent revision has advanced');
    const freshParentRevision = (
      firstCommit.error?.data as Readonly<{ currentParentRevision: unknown }>
    ).currentParentRevision;
    expect(typeof freshParentRevision).toBe('string');

    const rePreview = await host.handleRequest({
      method: 'canopy.v1.draft.preview',
      params: { draftId },
      id: 7,
    });
    expect(rePreview.error).toBeUndefined();

    const retryCommit = await host.handleRequest({
      method: 'canopy.v1.draft.commit',
      params: { draftId, expectedParentRevision: freshParentRevision },
      id: 8,
    });
    expect(retryCommit.error).toBeUndefined();
    expect(retryCommit.result).toEqual({ success: true });

    // 6. The WebClip node is now visible via a normal query.
    const afterCommit = await host.handleRequest({
      method: 'canopy.v1.query.getNodes',
      params: { type: webClipTypeId },
      id: 9,
    });
    expect(afterCommit.error).toBeUndefined();
    const nodesAfterCommit = afterCommit.result as readonly Readonly<{
      id: string;
      properties: Readonly<Record<string, unknown>>;
    }>[];
    expect(nodesAfterCommit).toHaveLength(1);
    expect(nodesAfterCommit[0]?.id).toBe(nodeId);
    expect(nodesAfterCommit[0]?.properties.title).toBe('Example page');
    expect(nodesAfterCommit[0]?.properties.sourceUrl).toBe('https://example.com/article');
  });
});
