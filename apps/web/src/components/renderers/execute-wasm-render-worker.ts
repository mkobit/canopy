/* eslint-disable functional/immutable-data -- encapsulated warm-worker pool + request-sequence state */
import { z } from 'zod';
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
import { err, fromThrowable, ok, type Result } from '@canopy/graph';
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
const renderOutputSchema = z.object({ html: z.string().min(1) });

const createRenderWorker = (): Worker =>
  new Worker(new URL('../../plugin/runtime/render-worker.ts', import.meta.url), {
    type: 'module',
    name: 'canopy-render-worker',
  });

// Workers terminated for exceeding a deadline; never recycled (spec: a
// terminated worker leaves no reusable poisoned state).
const terminatedWorkers = new WeakSet<Worker>();

export type RenderWorkerUnavailableReason =
  'missing-guest' | 'unknown-guest' | 'worker-construction' | 'worker-script-load';

export type RenderWorkerUnavailableError = Readonly<{
  code: 'RENDERER_UNAVAILABLE';
  category: 'RENDERER_UNAVAILABLE';
  reason: RenderWorkerUnavailableReason;
  message: string;
}>;

export type SandboxedGuestRenderResult = Result<
  string,
  ApiAdapterError | RenderWorkerUnavailableError
>;

export const isRenderWorkerUnavailable = (
  error: ApiAdapterError | RenderWorkerUnavailableError,
): error is RenderWorkerUnavailableError => error.code === 'RENDERER_UNAVAILABLE';

const unavailable = (
  reason: RenderWorkerUnavailableReason,
  message: string,
): RenderWorkerUnavailableError => ({
  code: 'RENDERER_UNAVAILABLE',
  category: 'RENDERER_UNAVAILABLE',
  reason,
  message,
});

const isUnavailableResult = (
  value: SerializedResult | RenderWorkerUnavailableError,
): value is RenderWorkerUnavailableError =>
  'code' in value && value.code === 'RENDERER_UNAVAILABLE';

type RenderWorkerFactory = () => Worker;

const acquireWorker = (
  createWorker: RenderWorkerFactory,
): Result<Worker, RenderWorkerUnavailableError> => {
  if (typeof Worker === 'undefined') {
    return err(unavailable('worker-construction', 'The renderer worker is unavailable'));
  }
  // eslint-disable-next-line functional/no-try-statements -- Worker construction is an unavailable-renderer boundary
  try {
    return ok(idleWorkers.pop() ?? createWorker());
  } catch (error) {
    return err(
      unavailable(
        'worker-construction',
        `The renderer worker could not be constructed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

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

const runWorkerRequest = async (
  worker: Worker,
  request: Readonly<{
    requestId: string;
    guestId: string;
    token: string;
    inputJson: string;
    timeoutMs: number;
  }>,
  resultReady: Promise<SerializedResult | RenderWorkerUnavailableError>,
  onUnavailable: (error: RenderWorkerUnavailableError) => void,
): Promise<Result<string, ApiAdapterError>> => {
  worker.postMessage({ kind: 'execute', ...request });
  const serialized = await resultReady;
  if (isUnavailableResult(serialized)) {
    onUnavailable(serialized);
    return err(createApiAdapterError('INTERNAL_ERROR', serialized.message));
  }
  if (
    !serialized.ok &&
    serialized.error.category === 'NOT_FOUND' &&
    serialized.error.message.startsWith('unknown guest ')
  ) {
    onUnavailable(unavailable('unknown-guest', serialized.error.message));
    return err(createApiAdapterError('INTERNAL_ERROR', serialized.error.message));
  }
  if (!serialized.ok) {
    return { ok: false, error: createApiAdapterError('INTERNAL_ERROR', serialized.error.message) };
  }
  const decoded = fromThrowable<unknown>(() => JSON.parse(serialized.value));
  const parsed = decoded.ok ? renderOutputSchema.safeParse(decoded.value) : undefined;
  return parsed?.success === true
    ? { ok: true, value: parsed.data.html }
    : {
        ok: false,
        error: createApiAdapterError('INTERNAL_ERROR', 'plugin returned invalid render output'),
      };
};

const createWorkerMessageHandler =
  (
    worker: Worker,
    requestId: string,
    dispatch: ReadonlyMap<
      string,
      (token: string, payload: string) => Promise<Result<string, WitErrorPayload>>
    >,
    resolveResult: (result: SerializedResult) => void,
  ): ((event: MessageEvent<unknown>) => void) =>
  (event): void => {
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

const createWorkerLoadFailureHandler =
  (
    worker: Worker,
    onUnavailable: (error: RenderWorkerUnavailableError) => void,
    resolveResult: (result: RenderWorkerUnavailableError) => void,
  ): ((event: Readonly<Event>) => void) =>
  (event): void => {
    event.preventDefault();
    if (terminatedWorkers.has(worker)) return;
    const error = unavailable(
      'worker-script-load',
      'The interactive renderer worker could not load',
    );
    onUnavailable(error);
    terminatedWorkers.add(worker);
    discardWorker(worker);
    resolveResult(error);
  };

const createWorkerMessageFailureHandler =
  (
    worker: Worker,
    resolveResult: (result: SerializedResult) => void,
  ): ((event: Readonly<Event>) => void) =>
  (event): void => {
    event.preventDefault();
    if (terminatedWorkers.has(worker)) return;
    terminatedWorkers.add(worker);
    discardWorker(worker);
    resolveResult({
      ok: false,
      error: {
        category: 'INTERNAL_ERROR',
        message: 'The interactive renderer worker returned an unreadable message',
      },
    });
  };

export const executeSandboxedGuestPluginInWorker = async (
  context: ApiAdapterContext,
  token: string,
  inputJson: string,
  guestId: string,
  timeoutMs: number = DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS,
  createWorker: RenderWorkerFactory = createRenderWorker,
): Promise<SandboxedGuestRenderResult> => {
  if (guestId.trim().length === 0) {
    return err(unavailable('missing-guest', 'The interactive renderer has no worker guest'));
  }

  requestSequence.next += 1;
  const requestId = `render-${requestSequence.next}`;
  const workerResult = acquireWorker(createWorker);
  if (!workerResult.ok) {
    return workerResult;
  }
  const worker = workerResult.value;

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

  const { promise: resultReady, resolve: resolveResult } = Promise.withResolvers<
    SerializedResult | RenderWorkerUnavailableError
  >();
  // eslint-disable-next-line functional/prefer-immutable-types -- mutable result side channel for unavailable worker boundaries
  const unavailableFailure: { value?: RenderWorkerUnavailableError } = {};

  const onUnavailable = (error: RenderWorkerUnavailableError): void => {
    unavailableFailure.value = error;
  };

  const onWorkerFailure = createWorkerLoadFailureHandler(worker, onUnavailable, resolveResult);
  const onWorkerMessageFailure = createWorkerMessageFailureHandler(worker, resolveResult);

  const onMessage = createWorkerMessageHandler(worker, requestId, dispatch, resolveResult);

  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onWorkerFailure);
  worker.addEventListener('messageerror', onWorkerMessageFailure);

  const outcome = await executeTerminableGuest(
    {
      execute: (): Promise<Result<string, ApiAdapterError>> =>
        runWorkerRequest(
          worker,
          { requestId, guestId, token, inputJson, timeoutMs },
          resultReady,
          onUnavailable,
        ),
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
  worker.removeEventListener('message', onMessage);
  worker.removeEventListener('error', onWorkerFailure);
  worker.removeEventListener('messageerror', onWorkerMessageFailure);
  if (terminatedWorkers.has(worker))
    return unavailableFailure.value === undefined ? outcome : err(unavailableFailure.value);
  releaseWorker(worker);

  return unavailableFailure.value === undefined ? outcome : err(unavailableFailure.value);
};
