import { NATIVE_HOST_NAME, STORAGE_KEYS } from '../shared/constants.js';
import { buildClipPayload } from '../shared/clip-payload.js';
import type { BackgroundResponse, PopupRequest } from '../shared/messages.js';
import {
  buildNodeCreatedEvent,
  createNativeRpcClient,
  extractConcurrentModificationRevision,
  extractRejectedTypeId,
  isDaemonUnavailable,
  type NativeRpcClient,
} from '../shared/native-rpc.js';

const WEBCLIP_TYPE_PLACEHOLDER = 'pending-webclip-type';

type DraftState = Readonly<{
  parentRevision: string;
  nodeId: string;
  clip: Readonly<{ title: string; sourceUrl: string; content: string; capturedAt: string }>;
}>;

const drafts = new Map<string, DraftState>();

// A connected native-messaging port keeps this service worker alive for as
// long as it stays open (one of MV3's sanctioned SW-alive mechanisms), so the
// closed-over connection state below is scoped to that connection's
// lifetime, not expected to survive an independent SW restart -- see
// AGENTS.md. Wrapped in an IIFE (mirrors apps/clip-host/src/host.ts's
// createClipHost) so the reassignable state is closure-local, not top-level.
const getClient = ((): (() => NativeRpcClient) => {
  // eslint-disable-next-line functional/no-let -- lazily-established, reused native-messaging connection
  let activeClient: NativeRpcClient | undefined;

  return (): NativeRpcClient => {
    if (activeClient) return activeClient;
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    const client = createNativeRpcClient((message) => port.postMessage(message));
    port.onMessage.addListener((message: unknown) => client.handleIncoming(message));
    port.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError?.message ?? 'Native messaging host disconnected';
      client.handleDisconnect(reason);
      activeClient = undefined;
    });
    activeClient = client;
    return client;
  };
})();

const getOrCreateDeviceId = async (): Promise<string> => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.DEVICE_ID);
  const existing = stored[STORAGE_KEYS.DEVICE_ID];
  if (typeof existing === 'string') return existing;

  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_KEYS.DEVICE_ID]: deviceId });
  return deviceId;
};

const getCachedWebClipTypeId = async (): Promise<string | undefined> => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.WEBCLIP_TYPE_ID);
  const cached = stored[STORAGE_KEYS.WEBCLIP_TYPE_ID];
  return typeof cached === 'string' ? cached : undefined;
};

const cacheWebClipTypeId = async (typeId: string): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEYS.WEBCLIP_TYPE_ID]: typeId });
};

/**
 * Stages a draft.apply for the WebClip instance, retrying once with the
 * host-supplied real type id if the caller's guess (cached or placeholder)
 * is rejected -- see apps/clip-host/src/host.ts's NAMESPACE_REJECTED
 * addendum and openspec/changes/browser-extension-web-clipper's tasks.md 3.5.
 */
const stageClipEvent = async (
  client: NativeRpcClient,
  draftId: string,
  properties: Readonly<Record<string, unknown>>,
  deviceId: string,
  nodeId: string,
): Promise<
  Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'daemon-unavailable' | 'rejected' }>
> => {
  const cachedTypeId = await getCachedWebClipTypeId();
  const attempt = async (nodeType: string) =>
    client.call('canopy.v1.draft.apply', {
      draftId,
      events: [
        buildNodeCreatedEvent({
          nodeType,
          properties,
          eventId: crypto.randomUUID(),
          nodeId,
          timestamp: Temporal.Now.instant().toString(),
          deviceId,
        }),
      ],
    });

  const first = await attempt(cachedTypeId ?? WEBCLIP_TYPE_PLACEHOLDER);
  if (!first.error) return { ok: true };
  if (isDaemonUnavailable(first)) return { ok: false, reason: 'daemon-unavailable' };

  const resolvedTypeId = extractRejectedTypeId(first);
  if (!resolvedTypeId) return { ok: false, reason: 'rejected' };

  await cacheWebClipTypeId(resolvedTypeId);
  const retry = await attempt(resolvedTypeId);
  if (!retry.error) return { ok: true };
  return {
    ok: false,
    reason: isDaemonUnavailable(retry) ? 'daemon-unavailable' : 'rejected',
  };
};

const handleStageClip = async (
  capture: PopupRequest & Readonly<{ type: 'stage-clip' }>,
): Promise<BackgroundResponse> => {
  const capturedAt = Temporal.Now.instant().toString();
  const clipResult = buildClipPayload(capture.capture, capturedAt);
  if (!clipResult.ok) {
    return {
      type: 'capture-error',
      reason: clipResult.error.reason === 'oversize-content' ? 'oversize-clip' : 'rejected',
      message: clipResult.error.message,
    };
  }
  const clip = clipResult.value;

  // eslint-disable-next-line functional/no-try-statements -- native-messaging port I/O boundary; a disconnect (host not installed) rejects, not returns
  try {
    const client = getClient();
    const deviceId = await getOrCreateDeviceId();

    const created = await client.call('canopy.v1.draft.create');
    if (created.error) {
      return {
        type: 'capture-error',
        reason: 'daemon-unavailable',
        message: created.error.message,
      };
    }
    const { draftId, parentRevision } = created.result as Readonly<{
      draftId: string;
      parentRevision: string;
    }>;

    const nodeId = crypto.randomUUID();
    const staged = await stageClipEvent(
      client,
      draftId,
      {
        title: clip.title,
        sourceUrl: clip.sourceUrl,
        content: clip.content,
        capturedAt: clip.capturedAt,
      },
      deviceId,
      nodeId,
    );
    if (!staged.ok) {
      return {
        type: 'capture-error',
        reason: staged.reason,
        message:
          staged.reason === 'daemon-unavailable'
            ? 'Could not reach the Canopy daemon. Make sure apps/daemon is running, then try again.'
            : 'The clip could not be staged.',
      };
    }

    const preview = await client.call('canopy.v1.draft.preview', { draftId });
    if (preview.error) {
      return {
        type: 'capture-error',
        reason: 'daemon-unavailable',
        message: preview.error.message,
      };
    }
    const previewResult = preview.result as Readonly<{
      counts: Readonly<{ created: number; updated: number; deleted: number }>;
      touchedNodeIds: readonly string[];
    }>;

    // eslint-disable-next-line functional/immutable-data -- per-session draft-state table
    drafts.set(draftId, { parentRevision, nodeId, clip });

    return {
      type: 'preview-ready',
      draftId,
      clip,
      preview: { counts: previewResult.counts, touchedNodeIds: previewResult.touchedNodeIds },
    };
  } catch (error) {
    return {
      type: 'capture-error',
      reason: 'host-not-installed',
      message:
        error instanceof Error
          ? `Could not reach the Canopy clip host: ${error.message}. Is it installed? See apps/extension/AGENTS.md.`
          : 'Could not reach the Canopy clip host. Is it installed?',
    };
  }
};

const commitWithRetry = async (
  client: NativeRpcClient,
  draftId: string,
  expectedParentRevision: string,
): Promise<Readonly<{ ok: true }> | Readonly<{ ok: false; message: string }>> => {
  const first = await client.call('canopy.v1.draft.commit', { draftId, expectedParentRevision });
  if (!first.error) return { ok: true };

  const freshRevision = extractConcurrentModificationRevision(first);
  if (!freshRevision) return { ok: false, message: first.error.message };

  // Re-preview before retrying (tasks.md 6.5): confirms the draft still
  // applies cleanly against the advanced parent before committing again.
  const preview = await client.call('canopy.v1.draft.preview', { draftId });
  if (preview.error) return { ok: false, message: preview.error.message };

  const retry = await client.call('canopy.v1.draft.commit', {
    draftId,
    expectedParentRevision: freshRevision,
  });
  if (!retry.error) return { ok: true };
  return { ok: false, message: retry.error.message };
};

const handleConfirmCommit = async (draftId: string): Promise<BackgroundResponse> => {
  const state = drafts.get(draftId);
  if (!state) {
    return { type: 'commit-error', message: 'This clip is no longer staged; capture it again.' };
  }

  // eslint-disable-next-line functional/no-try-statements -- native-messaging port I/O boundary
  try {
    const client = getClient();
    const result = await commitWithRetry(client, draftId, state.parentRevision);
    // eslint-disable-next-line functional/immutable-data -- per-session draft-state table
    drafts.delete(draftId);
    if (!result.ok) return { type: 'commit-error', message: result.message };
    return { type: 'commit-success', nodeId: state.nodeId };
  } catch (error) {
    return {
      type: 'commit-error',
      message: error instanceof Error ? error.message : 'Could not reach the Canopy clip host.',
    };
  }
};

const handleDiscard = async (draftId: string): Promise<BackgroundResponse> => {
  // eslint-disable-next-line functional/immutable-data -- per-session draft-state table
  drafts.delete(draftId);
  // eslint-disable-next-line functional/no-try-statements -- native-messaging port I/O boundary
  try {
    await getClient().call('canopy.v1.draft.discard', { draftId });
  } catch {
    // Best-effort: the draft was never committed either way, so a discard
    // that can't reach the host leaves no unconfirmed write behind.
  }
  return { type: 'discarded' };
};

const handleRequest = async (request: PopupRequest): Promise<BackgroundResponse> => {
  switch (request.type) {
    case 'stage-clip': {
      return handleStageClip(request);
    }
    case 'confirm-commit': {
      return handleConfirmCommit(request.draftId);
    }
    case 'discard': {
      return handleDiscard(request.draftId);
    }
    default: {
      return request satisfies never;
    }
  }
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  (async () => {
    sendResponse(await handleRequest(message as PopupRequest));
  })();
  return true;
});
