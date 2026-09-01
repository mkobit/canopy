/* eslint-disable functional/no-return-void */
import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import type { ApiAdapterContext } from '../api-context';
import type { ApiRequest, ApiResponse, ReplayRequestPayload } from '../api-payloads';
import { createApiRequest } from '../api-payloads';
import {
  executeCreateEdge,
  executeCreateNode,
  executeDeleteEdge,
  executeDeleteNode,
  executeUpdateNodeProperties,
} from '../mutation-handlers';
import {
  executeEdgeQuery,
  executeGraphTraversal,
  executeNodeQuery,
  executePropertyLookup,
} from '../query-handlers';
import { createEventStreamSubscriber, executeReplayEventStream } from '../event-stream-handlers';
import type { ApiAdapterError, WitErrorCode } from '../result-errors';
import { createApiAdapterError, toWitError } from '../result-errors';
import type { CapabilityValidator, WasmCapability } from './capabilities';
import { verifyCapability } from './capabilities';

// UTF-8 byte length via TextEncoder so host bindings run in both Node and the
// browser (the web render path); `Buffer` is Node-only.
const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length;

const safeParseJson = <T>(json: string): Result<T, ApiAdapterError> => {
  // eslint-disable-next-line functional/no-try-statements -- JSON.parse boundary
  try {
    return ok(JSON.parse(json) as T);
  } catch {
    return err(createApiAdapterError('VALIDATION_ERROR', 'Invalid JSON payload format'));
  }
};

export type WitErrorPayload = Readonly<{
  code: WitErrorCode;
  message: string;
}>;

export type FuelMeter = Readonly<{
  consume: (units: bigint) => Result<void, ApiAdapterError>;
  remaining: () => bigint;
}>;

export type ReentrancyGuard = Readonly<{
  enter: () => Result<void, ApiAdapterError>;
  exit: () => void;
}>;

export type MemoryChecker = Readonly<{
  checkBytes: (bytes: number) => Result<void, ApiAdapterError>;
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
  // Load-time bound capability scope. When present, host imports enforce this
  // token instead of the guest-supplied argument, preventing token injection.
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

// Executes a host binding call with safety checks and error translation.
const invokeHostBinding = async <TInput, TOutput>(
  context: ApiAdapterContext,
  token: string,
  payloadJson: string,
  requiredCapability: WasmCapability,
  options: WasmHostBindingsOptions,
  executor: (request: ApiRequest<TInput>) => ApiResponse<TOutput> | Promise<ApiResponse<TOutput>>,
): Promise<Result<string, WitErrorPayload>> => {
  const fuelPerCall = options.defaultFuelPerImport ?? 100n;

  if (options.reentrancyGuard) {
    const guardResult = options.reentrancyGuard.enter();
    if (!guardResult.ok) {
      return err(toWitError(guardResult.error));
    }
  }

  const runBinding = async (): Promise<Result<string, WitErrorPayload>> => {
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

    // Prefer the load-time bound token; fall back to the caller-supplied token
    // for backward compatibility when no bound token is configured.
    const effectiveToken = options.boundToken ?? token;
    const capResult = verifyCapability(
      effectiveToken,
      requiredCapability,
      options.validateCapability,
    );
    if (!capResult.ok) {
      return err(toWitError(capResult.error));
    }

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
    const request = createApiRequest(requestId, context, parsedPayload);
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

  return runBinding()
    .catch((error: unknown) =>
      err(
        toWitError(
          createApiAdapterError(
            'INTERNAL_ERROR',
            `Uncaught exception during host binding execution: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
      ),
    )
    .finally(() => {
      if (options.reentrancyGuard) {
        options.reentrancyGuard.exit();
      }
    });
};

// Creates host import bindings for WebAssembly Interface Types (WIT).
export const createWasmHostBindings = (
  context: ApiAdapterContext,
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
        (request: ApiRequest<ReplayRequestPayload>) =>
          executeReplayEventStream(request.context, request.payload),
      ),
  },
});
