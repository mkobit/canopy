import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import type {
  GraphAccessContext,
  GraphAccessError,
  GraphAccessRequest,
  GraphAccessResponse,
  ReplayRequestPayload,
} from '@canopy/graph-access';
import {
  createEventStreamSubscriber,
  createGraphAccessError,
  createGraphAccessRequest,
  executeCreateEdge,
  executeCreateNode,
  executeDeleteEdge,
  executeDeleteNode,
  executeEdgeQuery,
  executeGraphTraversal,
  executeNodeQuery,
  executePropertyLookup,
  executeReplayEventStream,
  executeUpdateNodeProperties,
} from '@canopy/graph-access';
import type { WitErrorCode } from '../result-errors';
import { toWitError } from '../result-errors';
import type { CapabilityValidator, WasmCapability } from './capabilities';
import { verifyCapability } from './capabilities';

// UTF-8 byte length via TextEncoder so host bindings run in both Node and the
// browser (the web render path); `Buffer` is Node-only.
const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length;

const safeParseJson = <T>(json: string): Result<T, GraphAccessError> => {
  // eslint-disable-next-line functional/no-try-statements -- JSON.parse boundary
  try {
    return ok(JSON.parse(json) as T);
  } catch {
    return err(createGraphAccessError('VALIDATION_ERROR', 'Invalid JSON payload format'));
  }
};

export type WitErrorPayload = Readonly<{
  code: WitErrorCode;
  message: string;
}>;

export type FuelMeter = Readonly<{
  consume: (units: bigint) => Result<void, GraphAccessError>;
  remaining: () => bigint;
}>;

export type ReentrancyGuard = Readonly<{
  enter: () => Result<void, GraphAccessError>;
  exit: () => boolean;
}>;

export type MemoryChecker = Readonly<{
  checkBytes: (bytes: number) => Result<void, GraphAccessError>;
}>;

// Marshals a single host import to a remote graph (the main-thread graph, when
// the guest runs in a worker). Receives the required capability (which uniquely
// identifies the operation), the effective bound token, and the raw payload;
// returns the same already-serialized `Result` an executor would. The remote
// side re-enforces the capability against its real graph (design decision 3a).
export type RemoteHostDispatch = (
  requiredCapability: WasmCapability,
  effectiveToken: string,
  payloadJson: string,
) => Promise<Result<string, WitErrorPayload>>;

export type WasmHostBindingsOptions = Readonly<{
  validateCapability?: CapabilityValidator;
  // Load-time bound capability scope required for host import execution.
  // When omitted or empty, host bindings fail closed with PERMISSION_DENIED.
  // When present, host imports enforce this closure-bound token and reject
  // caller-supplied token overrides across the guest ABI.
  boundToken?: string;
  fuelMeter?: FuelMeter;
  reentrancyGuard?: ReentrancyGuard;
  memoryChecker?: MemoryChecker;
  defaultFuelPerImport?: bigint;
  // When present, host imports are marshaled here instead of run against the
  // local graph, keeping the fuel/reentrancy/memory/capability guards in place.
  remoteDispatch?: RemoteHostDispatch;
}>;

export type WasmHostQueryBindings = Readonly<{
  queryNodes: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
  queryEdges: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
  lookupProperties: (
    token: string,
    payloadJson: string,
  ) => Promise<Result<string, WitErrorPayload>>;
  traverseGraph: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
}>;

export type WasmHostMutationBindings = Readonly<{
  createNode: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
  updateNodeProperties: (
    token: string,
    payloadJson: string,
  ) => Promise<Result<string, WitErrorPayload>>;
  deleteNode: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
  createEdge: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
  deleteEdge: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
}>;

export type WasmHostEventBindings = Readonly<{
  subscribeEvents: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
  replayEvents: (token: string, payloadJson: string) => Promise<Result<string, WitErrorPayload>>;
}>;

export type WasmHostBindings = Readonly<{
  queries: WasmHostQueryBindings;
  mutations: WasmHostMutationBindings;
  events: WasmHostEventBindings;
}>;

// Validates fuel, memory, and capability token guards before host operation execution.
const checkBindingGuards = (
  options: WasmHostBindingsOptions,
  payloadJson: string,
  fuelPerCall: bigint,
  boundToken: string,
  requiredCapability: WasmCapability,
): Result<string, WitErrorPayload> => {
  if (options.fuelMeter) {
    const fuelResult = options.fuelMeter.consume(fuelPerCall);
    if (!fuelResult.ok) {
      return err(toWitError(fuelResult.error));
    }
  }

  if (options.memoryChecker) {
    const inputBytes = utf8ByteLength(payloadJson);
    const memResult = options.memoryChecker.checkBytes(inputBytes);
    if (!memResult.ok) {
      return err(toWitError(memResult.error));
    }
  }

  // Verify capability strictly against the closure-bound token.
  // Caller-supplied token overrides across the guest ABI are rejected.
  const capResult = verifyCapability(boundToken, requiredCapability, options.validateCapability);
  return capResult.ok ? ok(boundToken) : err(toWitError(capResult.error));
};

// Executes a host binding call with safety checks and error translation.
const invokeHostBinding = async <TInput, TOutput>(
  context: GraphAccessContext,
  _callerToken: string,
  payloadJson: string,
  requiredCapability: WasmCapability,
  options: WasmHostBindingsOptions,
  executor: (
    request: GraphAccessRequest<TInput>,
  ) => GraphAccessResponse<TOutput> | Promise<GraphAccessResponse<TOutput>>,
): Promise<Result<string, WitErrorPayload>> => {
  const fuelPerCall = options.defaultFuelPerImport ?? 100n;

  if (options.boundToken === undefined || options.boundToken.trim().length === 0) {
    return err(
      toWitError(
        createGraphAccessError(
          'FORBIDDEN',
          'Host bindings require a verified bound capability token',
        ),
      ),
    );
  }

  const boundToken = options.boundToken;

  if (options.reentrancyGuard) {
    const guardResult = options.reentrancyGuard.enter();
    if (!guardResult.ok) {
      return err(toWitError(guardResult.error));
    }
  }

  const runBinding = async (): Promise<Result<string, WitErrorPayload>> => {
    const guardOutcome = checkBindingGuards(
      options,
      payloadJson,
      fuelPerCall,
      boundToken,
      requiredCapability,
    );
    if (!guardOutcome.ok) {
      return guardOutcome;
    }
    const effectiveToken = guardOutcome.value;

    // Worker-isolated path: marshal to the main-thread graph after the in-worker
    // guards have passed. The remote side re-checks the capability against its
    // real graph before mutating (design decision 3a).
    if (options.remoteDispatch) {
      return options.remoteDispatch(requiredCapability, effectiveToken, payloadJson);
    }

    const parsedPayloadResult = safeParseJson<TInput>(payloadJson);
    if (!parsedPayloadResult.ok) {
      return err(toWitError(parsedPayloadResult.error));
    }
    const parsedPayload = parsedPayloadResult.value;

    const requestId = `wit-${requiredCapability}-${Temporal.Now.instant().epochMilliseconds}`;
    const request = createGraphAccessRequest(requestId, context, parsedPayload);
    const result = await executor(request);

    if (!result.ok) {
      return err(toWitError(result.error));
    }

    const outputJson = JSON.stringify(result.value);

    if (options.memoryChecker) {
      const outputBytes = utf8ByteLength(outputJson);
      const memResult = options.memoryChecker.checkBytes(outputBytes);
      if (!memResult.ok) {
        return err(toWitError(memResult.error));
      }
    }

    return ok(outputJson);
  };

  const outcome = await runBinding().catch((error: unknown) =>
    err(
      toWitError(
        createGraphAccessError(
          'INTERNAL_ERROR',
          `Uncaught exception during host binding execution: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    ),
  );
  if (options.reentrancyGuard) {
    options.reentrancyGuard.exit();
  }
  return outcome;
};

// Creates host import bindings for WebAssembly Interface Types (WIT).
export const createWasmHostBindings = (
  context: GraphAccessContext,
  options: WasmHostBindingsOptions = {},
): WasmHostBindings => ({
  queries: {
    queryNodes: (token, payloadJson) =>
      invokeHostBinding(context, token, payloadJson, 'read:nodes', options, executeNodeQuery),
    queryEdges: (token, payloadJson) =>
      invokeHostBinding(context, token, payloadJson, 'read:edges', options, executeEdgeQuery),
    lookupProperties: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'read:properties',
        options,
        executePropertyLookup,
      ),
    traverseGraph: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'read:traversal',
        options,
        executeGraphTraversal,
      ),
  },
  mutations: {
    createNode: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'write:create-node',
        options,
        executeCreateNode,
      ),
    updateNodeProperties: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'write:update-properties',
        options,
        executeUpdateNodeProperties,
      ),
    deleteNode: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'write:delete-node',
        options,
        executeDeleteNode,
      ),
    createEdge: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'write:create-edge',
        options,
        executeCreateEdge,
      ),
    deleteEdge: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'write:delete-edge',
        options,
        executeDeleteEdge,
      ),
  },
  events: {
    subscribeEvents: (token, payloadJson) =>
      invokeHostBinding(context, token, payloadJson, 'read:events', options, (request) => {
        const subscriber = createEventStreamSubscriber(request.context);
        return ok({ subscribed: !subscriber.isClosed() });
      }),
    replayEvents: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'read:events',
        options,
        (request: GraphAccessRequest<ReplayRequestPayload>) =>
          executeReplayEventStream(request.context, request.payload),
      ),
  },
});
