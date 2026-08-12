// A minimal JSON-RPC 2.0 client over a native-messaging port, matching the
// wire protocol apps/clip-host/src/host.ts speaks. Deliberately has no
// @canopy/* dependency (see AGENTS.md) -- these are hand-rolled shapes, not
// imports of the daemon's real schemas.

export type JsonRpcResponse = Readonly<{
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: Readonly<{ code: number; message: string; data?: unknown }>;
}>;

export type NativeRpcClient = Readonly<{
  call: (method: string, parameters?: unknown) => Promise<JsonRpcResponse>;
  /** Wire this to the native-messaging port's onMessage listener. */
  handleIncoming: (message: unknown) => void;
  /**
   * Wire this to the port's onDisconnect listener. Without this, a call
   * pending when the port disconnects (e.g. host not installed, or the host
   * crashes) would never resolve or reject -- the caller would hang forever.
   */
  handleDisconnect: (reason: string) => void;
}>;

type PendingCall = Readonly<{
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
}>;

/**
 * `send` is injected so this client is testable without a real
 * chrome.runtime.Port -- mirrors apps/clip-host's ClipHostOptions.connect
 * dependency-injection pattern.
 */
export const createNativeRpcClient = (send: (message: unknown) => void): NativeRpcClient => {
  const pending = new Map<number, PendingCall>();
  // eslint-disable-next-line functional/no-let -- monotonic request-id counter, incremented per call()
  let nextId = 1;

  const call = (method: string, parameters?: unknown): Promise<JsonRpcResponse> => {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line functional/immutable-data -- local pending-call table
      pending.set(id, { resolve, reject });
      send({ jsonrpc: '2.0', method, params: parameters, id });
    });
  };

  const handleIncoming = (message: unknown): void => {
    if (typeof message !== 'object' || message === null || !('id' in message)) return;
    const response = message as JsonRpcResponse;
    if (typeof response.id !== 'number') return;
    const entry = pending.get(response.id);
    if (!entry) return;
    // eslint-disable-next-line functional/immutable-data -- local pending-call table
    pending.delete(response.id);
    entry.resolve(response);
  };

  const handleDisconnect = (reason: string): void => {
    // eslint-disable-next-line functional/no-loop-statements -- rejecting every pending call on disconnect
    for (const entry of pending.values()) {
      entry.reject(new Error(reason));
    }
    // eslint-disable-next-line functional/immutable-data -- local pending-call table
    pending.clear();
  };

  return { call, handleIncoming, handleDisconnect };
};

export type WireNodeCreatedEvent = Readonly<{
  type: 'NodeCreated';
  eventId: string;
  id: string;
  nodeType: string;
  properties: Readonly<Record<string, unknown>>;
  timestamp: string;
  deviceId: string;
}>;

export type BuildNodeCreatedEventInput = Readonly<{
  nodeType: string;
  properties: Readonly<Record<string, unknown>>;
  eventId: string;
  nodeId: string;
  timestamp: string;
  deviceId: string;
}>;

/**
 * Pure: the caller supplies eventId/nodeId/timestamp/deviceId (generated via
 * crypto.randomUUID()/Temporal.Now.instant() at the call site) so this stays
 * testable without stubbing those globals.
 */
export const buildNodeCreatedEvent = (input: BuildNodeCreatedEventInput): WireNodeCreatedEvent => ({
  type: 'NodeCreated',
  eventId: input.eventId,
  id: input.nodeId,
  nodeType: input.nodeType,
  properties: input.properties,
  timestamp: input.timestamp,
  deviceId: input.deviceId,
});

const CLIP_HOST_NAMESPACE_REJECTED_CODE = -32_002;
const CLIP_HOST_DAEMON_UNAVAILABLE_CODE = -32_004;
const CANOPY_DOMAIN_ERROR_CODE = -32_000;

/** Matches apps/clip-host/src/host.ts's CLIP_HOST_ERROR_CODES.DAEMON_UNAVAILABLE. */
export const isDaemonUnavailable = (response: JsonRpcResponse): boolean =>
  response.error?.code === CLIP_HOST_DAEMON_UNAVAILABLE_CODE;

/**
 * Extracts the ensured WebClip TypeId from a NAMESPACE_REJECTED response
 * (apps/clip-host/src/host.ts's addendum: the rejection carries the
 * already-resolved id in `error.data.webClipTypeId` so a caller that didn't
 * know it yet can retry with the correct nodeType).
 */
export const extractRejectedTypeId = (response: JsonRpcResponse): string | undefined => {
  if (response.error?.code !== CLIP_HOST_NAMESPACE_REJECTED_CODE) return undefined;
  const data = response.error.data;
  if (typeof data !== 'object' || data === null || !('webClipTypeId' in data)) return undefined;
  const { webClipTypeId } = data as Readonly<{ webClipTypeId: unknown }>;
  return typeof webClipTypeId === 'string' ? webClipTypeId : undefined;
};

/**
 * Extracts the fresh parent revision from a draft.commit `concurrent-modification`
 * error (see packages/api-adapter/src/ipc/ipc-handlers.ts's draftErrorResponse),
 * so the caller can re-preview/retry (tasks.md 6.5).
 */
export const extractConcurrentModificationRevision = (
  response: JsonRpcResponse,
): string | undefined => {
  if (response.error?.code !== CANOPY_DOMAIN_ERROR_CODE) return undefined;
  const data = response.error.data;
  if (typeof data !== 'object' || data === null) return undefined;
  const { type, currentParentRevision } = data as Readonly<{
    type: unknown;
    currentParentRevision: unknown;
  }>;
  return type === 'concurrent-modification' && typeof currentParentRevision === 'string'
    ? currentParentRevision
    : undefined;
};
