/// <reference lib="webworker" />
/* eslint-disable functional/immutable-data -- encapsulated worker call-registry + sequence state */
import {
  createApiAdapterContext,
  executeSandboxedGuestPlugin,
  hardenGuestWorkerScope,
  type ApiAdapterContext,
  type RemoteHostDispatch,
  type WasmCapability,
} from '@canopy/api-adapter';
import { asGraphId, createGraph, err, ok } from '@canopy/graph';
import { WORKER_GUESTS } from './worker-guests';
import { workerInboundSchema, type ExecuteRequest, type SerializedResult } from './worker-protocol';

// Deny nested-worker escape: a guest inside this worker cannot spawn a child
// worker that outlives terminate() of this one (design decision 3a / finding 7).
hardenGuestWorkerScope(globalThis);

// A worker-local graph satisfies the executor's context type. It is never read:
// every host import is marshaled to the main-thread graph via `remoteDispatch`
// below, so the guards run in this worker but the real graph stays on main.
// Bootstrap of a fresh empty graph does not fail; `undefined` is the belt-and-
// braces fallback so the module never throws at load.
const buildStubContext = (): ApiAdapterContext | undefined => {
  const graphResult = createGraph(asGraphId('render-worker-stub'), 'render-worker');
  return graphResult.ok ? createApiAdapterContext({ graph: graphResult.value }) : undefined;
};

const stubContext = buildStubContext();

// Pending host-import round-trips, keyed by callId. Resolved when the main thread
// answers with a `host-result` message. `sequence` is an encapsulated counter.
const pendingHostCalls = new Map<string, (result: SerializedResult) => void>();
const sequence = { next: 0 };

// Marshals a guest host import to the main-thread graph and awaits the answer.
// The executor's in-worker fuel/reentrancy/memory/capability guards have already
// run before this fires; the main thread re-checks the capability against the
// real graph (design decision 3a).
const makeRemoteDispatch =
  (requestId: string): RemoteHostDispatch =>
  (requiredCapability: WasmCapability, effectiveToken: string, payloadJson: string) => {
    sequence.next += 1;
    const callId = `${requestId}:${sequence.next}`;
    return new Promise((resolve) => {
      pendingHostCalls.set(callId, (serialized) => {
        resolve(
          serialized.ok
            ? ok(serialized.value)
            : err({ code: 'InternalError', message: serialized.error.message }),
        );
      });
      // The main handler maps the capability back to the concrete binding.
      postMessage({
        kind: 'host-call' as const,
        requestId,
        callId,
        group: 'queries' as const,
        method: requiredCapability,
        token: effectiveToken,
        payloadJson,
      });
    });
  };

const runExecute = async (request: ExecuteRequest): Promise<void> => {
  const guest = WORKER_GUESTS.get(request.guestId);
  if (guest === undefined || stubContext === undefined) {
    postMessage({
      kind: 'result',
      requestId: request.requestId,
      result: {
        ok: false,
        error: { category: 'NOT_FOUND', message: `unknown guest ${request.guestId}` },
      },
    });
    return;
  }

  const executionResult = await executeSandboxedGuestPlugin(
    stubContext,
    request.token,
    request.inputJson,
    guest,
    { remoteDispatch: makeRemoteDispatch(request.requestId) },
  );

  postMessage({
    kind: 'result',
    requestId: request.requestId,
    result: executionResult.ok
      ? { ok: true, value: executionResult.value }
      : {
          ok: false,
          error: {
            category: executionResult.error.category,
            message: executionResult.error.message,
          },
        },
  });
};

addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = workerInboundSchema.safeParse(event.data);
  if (!parsed.success) {
    return;
  }
  const message = parsed.data;
  if (message.kind === 'host-result') {
    const pending = pendingHostCalls.get(message.callId);
    if (pending !== undefined) {
      pendingHostCalls.delete(message.callId);
      pending(message.result);
    }
    return;
  }
  void runExecute(message);
});
