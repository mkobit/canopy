/* eslint-disable functional/no-return-void */
import type { Result } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';
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

export type WasmHostBindingsOptions = Readonly<{
  validateCapability?: CapabilityValidator;
  fuelMeter?: FuelMeter;
  reentrancyGuard?: ReentrancyGuard;
  memoryChecker?: MemoryChecker;
  defaultFuelPerImport?: bigint;
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
    const guardRes = options.reentrancyGuard.enter();
    if (!guardRes.ok) {
      return err(toWitError(guardRes.error));
    }
  }

  // eslint-disable-next-line functional/no-try-statements -- defensive exception boundary for WASM host import execution
  try {
    if (options.fuelMeter) {
      const fuelRes = options.fuelMeter.consume(fuelPerCall);
      if (!fuelRes.ok) {
        return err(toWitError(fuelRes.error));
      }
    }

    if (options.memoryChecker) {
      const inputBytes = Buffer.byteLength(payloadJson, 'utf8');
      const memRes = options.memoryChecker.checkBytes(inputBytes);
      if (!memRes.ok) {
        return err(toWitError(memRes.error));
      }
    }

    const capRes = verifyCapability(token, requiredCapability, options.validateCapability);
    if (!capRes.ok) {
      return err(toWitError(capRes.error));
    }

    // eslint-disable-next-line functional/no-let -- parse input payload
    let parsedPayload: TInput;
    // eslint-disable-next-line functional/no-try-statements -- JSON parse guard
    try {
      parsedPayload = JSON.parse(payloadJson) as TInput;
    } catch {
      return err(
        toWitError(createApiAdapterError('VALIDATION_ERROR', 'Invalid JSON payload format')),
      );
    }

    const requestId = `wit-${requiredCapability}-${Temporal.Now.instant().epochMilliseconds}`;
    const request = createApiRequest(requestId, context, parsedPayload);
    const result = await executor(request);

    if (!result.ok) {
      return err(toWitError(result.error));
    }

    const outputJson = JSON.stringify(result.value);

    if (options.memoryChecker) {
      const outputBytes = Buffer.byteLength(outputJson, 'utf8');
      const memRes = options.memoryChecker.checkBytes(outputBytes);
      if (!memRes.ok) {
        return err(toWitError(memRes.error));
      }
    }

    return ok(outputJson);
  } catch (error) {
    return err(
      toWitError(
        createApiAdapterError(
          'INTERNAL_ERROR',
          `Uncaught exception during host binding execution: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    );
  } finally {
    if (options.reentrancyGuard) {
      options.reentrancyGuard.exit();
    }
  }
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
      invokeHostBinding(context, token, payloadJson, 'read:events', options, (req) => {
        const subscriber = createEventStreamSubscriber(req.context);
        return ok({ subscribed: !subscriber.isClosed() });
      }),
    replayEvents: (token, payloadJson) =>
      invokeHostBinding(
        context,
        token,
        payloadJson,
        'read:events',
        options,
        (req: ApiRequest<ReplayRequestPayload>) =>
          executeReplayEventStream(req.context, req.payload),
      ),
  },
});
