/// <reference lib="webworker" />
import {
  executeSandboxedGuestPlugin,
  hardenGuestWorkerScope,
  type RemoteHostDispatch,
  type WasmHostBindings,
} from '@canopy/plugin-host';
import { createGraphAccessContext, type GraphAccessContext } from '@canopy/graph-access';
import { asGraphId, createGraph, err, fromThrowable, ok } from '@canopy/graph';
import {
  workerInboundSchema,
  type ExecuteRequest,
  type SerializedResult,
} from '../../../src/plugin/runtime/worker-protocol';

hardenGuestWorkerScope(globalThis);

type FixtureInput = Readonly<{ mode?: string }>;

const modeFromInput = (inputJson: string): string => {
  const parsedResult = fromThrowable<unknown>(() => JSON.parse(inputJson));
  if (
    parsedResult.ok &&
    typeof parsedResult.value === 'object' &&
    parsedResult.value !== null &&
    'mode' in parsedResult.value
  ) {
    const mode = parsedResult.value.mode;
    return typeof mode === 'string' ? mode : '';
  }
  return '';
};

const buildStubContext = (): GraphAccessContext | undefined => {
  const graphResult = createGraph(asGraphId('plugin-host-regressions-worker'), 'fixture worker');
  return graphResult.ok ? createGraphAccessContext({ graph: graphResult.value }) : undefined;
};

const stubContext = buildStubContext();
const pendingHostCalls = new Map<string, (result: SerializedResult) => void>();
const sequence = { next: 0 };

const makeRemoteDispatch =
  (requestId: string): RemoteHostDispatch =>
  (requiredCapability, effectiveToken, payloadJson) => {
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
      postMessage({
        kind: 'host-call' as const,
        requestId,
        callId,
        group: 'mutations' as const,
        method: requiredCapability,
        token: effectiveToken,
        payloadJson,
      });
    });
  };

const fixtureGuest = async (hostBindings: WasmHostBindings, inputJson: string): Promise<string> => {
  const input: FixtureInput = { mode: modeFromInput(inputJson) };
  if (input.mode === 'hang') {
    // Deliberately non-yielding. The browser-side deadline must terminate the
    // native worker; no promise timeout can interrupt this loop.
    const infiniteLoopModule = new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0, // wasm magic/version
      1,
      4,
      1,
      96,
      0,
      0, // () -> () type
      3,
      2,
      1,
      0, // function declaration
      7,
      7,
      1,
      3,
      114,
      117,
      110,
      0,
      0, // export run
      10,
      9,
      1,
      7,
      0,
      3,
      64,
      12,
      0,
      11,
      11, // loop { br 0 }
    ]);
    const instanceResult = await WebAssembly.instantiate(infiniteLoopModule);
    const run = instanceResult.instance.exports.run;
    if (typeof run === 'function') run();
  }

  const guestToken = input.mode === 'changed-token' ? 'write:*' : '*';
  const callResult = await hostBindings.mutations.createNode(
    guestToken,
    JSON.stringify({
      id: `fixture-${input.mode ?? 'unknown'}`,
      type: 'fixture:regression',
      properties: { mode: input.mode ?? 'unknown' },
    }),
  );
  return JSON.stringify({ html: JSON.stringify({ hostCall: callResult }) });
};

const runExecute = async (request: ExecuteRequest): Promise<void> => {
  if (stubContext === undefined) return;
  const executionResult = await executeSandboxedGuestPlugin(
    stubContext,
    request.token,
    request.inputJson,
    fixtureGuest,
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
  if (!parsed.success) return;
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
