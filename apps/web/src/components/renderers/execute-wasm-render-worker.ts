/* eslint-disable functional/immutable-data -- encapsulated warm-worker pool + request-sequence state */
import type { Result } from '@canopy/graph';
import {
  createApiAdapterError,
  createWasmHostBindings,
  createFuelMeter,
  createMemoryChecker,
  createReentrancyGuard,
  executeTerminableGuest,
  DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS,
  DEFAULT_WASM_FUEL_LIMIT,
  DEFAULT_WASM_MAX_MEMORY_BYTES,
  type ApiAdapterContext,
  type ApiAdapterError,
  type WasmHostBindings,
  type WitErrorPayload,
} from '@canopy/api-adapter';
import {
  hostCallSchema,
  executeResultSchema,
  type HostCall,
  type SerializedResult,
} from '../../plugin/runtime/worker-protocol';

// Terminable worker-isolated render transport. Runs an untrusted guest inside a
// Web Worker the host can `terminate()` on a wall-clock deadline, so a
// synchronous-runaway guest cannot hang the main thread (spec:
// terminable-plugin-execution). Host imports the guest makes are marshaled back
// here and run against the real graph, capability-checked main-side (decision 3a).

// Warm pool of idle workers reused across renders (worker + component
// instantiation is far heavier than a main-thread call — adversarial review).
const MAX_POOL_SIZE = 4;
const idleWorkers: Worker[] = [];

const createRenderWorker = (): Worker =>
  new Worker(new URL('../../plugin/runtime/render-worker.ts', import.meta.url), {
    type: 'module',
    name: 'canopy-render-worker',
  });

// Workers terminated for exceeding a deadline; never recycled (spec: a
// terminated worker leaves no reusable poisoned state).
const terminatedWorkers = new WeakSet<Worker>();

const acquireWorker = (): Worker => idleWorkers.pop() ?? createRenderWorker();

const releaseWorker = (worker: Worker): void => {
  if (idleWorkers.length < MAX_POOL_SIZE) idleWorkers.push(worker);
  else worker.terminate();
};

// A terminated worker is discarded, never returned to the pool: it must leave no
// reusable poisoned state (spec: terminated worker leaves no reusable state).
const discardWorker = (worker: Worker): void => {
  worker.terminate();
};

// Maps a marshaled host-import capability (a plain string on the wire) to the
// concrete main-side binding.
const buildDispatchTable = (
  bindings: WasmHostBindings,
): ReadonlyMap<
  string,
  (token: string, payload: string) => Promise<Result<string, WitErrorPayload>>
> =>
  new Map([
    ['read:nodes', bindings.queries.queryNodes],
    ['read:edges', bindings.queries.queryEdges],
    ['read:properties', bindings.queries.lookupProperties],
    ['read:traversal', bindings.queries.traverseGraph],
    ['read:events', bindings.events.replayEvents],
    ['write:create-node', bindings.mutations.createNode],
    ['write:update-properties', bindings.mutations.updateNodeProperties],
    ['write:delete-node', bindings.mutations.deleteNode],
    ['write:create-edge', bindings.mutations.createEdge],
    ['write:delete-edge', bindings.mutations.deleteEdge],
  ]);

const serializeHostResult = (result: Result<string, WitErrorPayload>): SerializedResult =>
  result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: { category: result.error.code, message: result.error.message } };

// Monotonic request-id source held on an object (no reassigned top-level binding).
const requestSequence = { next: 0 };

export const executeSandboxedGuestPluginInWorker = async (
  context: ApiAdapterContext,
  token: string,
  inputJson: string,
  guestId: string,
  timeoutMs: number = DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS,
): Promise<Result<string, ApiAdapterError>> => {
  requestSequence.next += 1;
  const requestId = `render-${requestSequence.next}`;
  const worker = acquireWorker();

  // Real main-side host bindings: bound token + the same guards the local path
  // uses (not redefined/weakened — spec). The worker's guards ran first; these
  // re-enforce the capability against the real graph.
  const bindings = createWasmHostBindings(context, {
    boundToken: token,
    fuelMeter: createFuelMeter(DEFAULT_WASM_FUEL_LIMIT),
    reentrancyGuard: createReentrancyGuard(),
    memoryChecker: createMemoryChecker(DEFAULT_WASM_MAX_MEMORY_BYTES),
  });
  const dispatch = buildDispatchTable(bindings);

  const { promise: resultReady, resolve: resolveResult } =
    Promise.withResolvers<SerializedResult>();

  const onMessage = (event: MessageEvent<unknown>): void => {
    const callParsed = hostCallSchema.safeParse(event.data);
    if (callParsed.success) {
      const call: HostCall = callParsed.data;
      const binding = dispatch.get(call.method);
      const answer = (result: Result<string, WitErrorPayload>): void => {
        worker.postMessage({
          kind: 'host-result',
          callId: call.callId,
          result: serializeHostResult(result),
        });
      };
      if (binding === undefined) {
        worker.postMessage({
          kind: 'host-result',
          callId: call.callId,
          result: {
            ok: false,
            error: { category: 'FORBIDDEN', message: `unknown host import ${call.method}` },
          },
        });
        return;
      }
      void binding(call.token, call.payloadJson).then(answer);
      return;
    }
    const resultParsed = executeResultSchema.safeParse(event.data);
    if (resultParsed.success && resultParsed.data.requestId === requestId) {
      resolveResult(resultParsed.data.result);
    }
  };

  worker.addEventListener('message', onMessage);

  const outcome = await executeTerminableGuest(
    {
      execute: async (): Promise<Result<string, ApiAdapterError>> => {
        worker.postMessage({ kind: 'execute', requestId, guestId, token, inputJson, timeoutMs });
        const serialized = await resultReady;
        return serialized.ok
          ? { ok: true, value: serialized.value }
          : { ok: false, error: createApiAdapterError('INTERNAL_ERROR', serialized.error.message) };
      },
      terminate: (): void => {
        terminatedWorkers.add(worker);
        worker.removeEventListener('message', onMessage);
        discardWorker(worker);
      },
    },
    timeoutMs,
  );

  // A terminated worker was already discarded; only a cleanly-completed worker is
  // recycled (never reuse possibly-poisoned state — spec).
  if (!terminatedWorkers.has(worker)) {
    worker.removeEventListener('message', onMessage);
    releaseWorker(worker);
  }

  return outcome;
};
