/* eslint-disable functional/no-return-void, functional/prefer-tacit, max-lines-per-function */
import * as net from 'node:net';
import type {
  ApiEdgePayload,
  ApiNodePayload,
  CreateEdgeParams,
  CreateNodeParams,
  DeleteEdgeParams,
  DeleteNodeParams,
  ExecuteQueryParams,
  GetEdgesParams,
  GetNodesParams,
  HandshakeResult,
  JsonRpcId,
  JsonRpcResponse,
  SubscribeParams,
  SubscribeResult,
  UnsubscribeResult,
  UpdateNodePropertiesParams,
} from '@canopy/api-adapter';
import { IPC_METHODS, JSON_RPC_ERROR_CODES } from '@canopy/api-adapter';
import { Context, Effect, Layer } from 'effect';

export type IpcClientError = Readonly<{
  _tag: 'IpcClientError';
  code: number;
  message: string;
  details?: unknown;
}>;

export const createIpcClientError = (
  payload: Readonly<{
    code: number;
    message: string;
    details?: unknown;
  }>,
): IpcClientError => ({
  _tag: 'IpcClientError',
  ...payload,
});

export interface IpcClient {
  readonly handshake: (clientVersion?: string) => Effect.Effect<HandshakeResult, IpcClientError>;
  readonly getNode: (id: string) => Effect.Effect<ApiNodePayload, IpcClientError>;
  readonly getNodes: (
    parameters?: Readonly<GetNodesParams>,
  ) => Effect.Effect<readonly ApiNodePayload[], IpcClientError>;
  readonly getEdge: (id: string) => Effect.Effect<ApiEdgePayload, IpcClientError>;
  readonly getEdges: (
    parameters?: Readonly<GetEdgesParams>,
  ) => Effect.Effect<readonly ApiEdgePayload[], IpcClientError>;
  readonly executeQuery: (
    parameters?: Readonly<ExecuteQueryParams>,
  ) => Effect.Effect<readonly ApiNodePayload[], IpcClientError>;
  readonly createNode: (
    parameters: Readonly<CreateNodeParams>,
  ) => Effect.Effect<ApiNodePayload, IpcClientError>;
  readonly updateNodeProperties: (
    parameters: Readonly<UpdateNodePropertiesParams>,
  ) => Effect.Effect<ApiNodePayload, IpcClientError>;
  readonly deleteNode: (
    parameters: Readonly<DeleteNodeParams>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly createEdge: (
    parameters: Readonly<CreateEdgeParams>,
  ) => Effect.Effect<ApiEdgePayload, IpcClientError>;
  readonly deleteEdge: (
    parameters: Readonly<DeleteEdgeParams>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly subscribe: (
    parameters?: Readonly<SubscribeParams>,
    onEvent?: (event: unknown) => void,
  ) => Effect.Effect<SubscribeResult, IpcClientError>;
  readonly unsubscribe: (
    subscriptionId: string,
  ) => Effect.Effect<UnsubscribeResult, IpcClientError>;
  readonly close: () => Effect.Effect<void, never>;
}

export const IpcClientService = Context.GenericTag<IpcClient>('@canopy/cli/IpcClient');

export const makeIpcClient = (socketPath: string): Effect.Effect<IpcClient, IpcClientError> => {
  return Effect.async<IpcClient, IpcClientError>((resume) => {
    // eslint-disable-next-line functional/no-let
    let requestCounter = 0;
    const pendingRequests = new Map<
      JsonRpcId,
      { resolve: (response: JsonRpcResponse) => void; reject: (error: IpcClientError) => void }
    >();
    const subscriptionCallbacks = new Map<string, (event: unknown) => void>();

    // eslint-disable-next-line functional/no-let
    let buffer = '';
    const socket = net.connect(socketPath);

    socket.on('connect', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping
      const sendRpcRequest = <T>(method: string, parameters?: unknown): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
          requestCounter += 1;
          const id = requestCounter;

          // eslint-disable-next-line functional/immutable-data
          pendingRequests.set(id, {
            resolve: (response: JsonRpcResponse) => {
              if (response.error) {
                reject(
                  createIpcClientError({
                    code: response.error.code,
                    message: response.error.message,
                    details: response.error.data,
                  }),
                );
              } else {
                resolve(response.result as T);
              }
            },
            reject: (error: IpcClientError) => reject(error),
          });

          const payload = JSON.stringify({
            jsonrpc: '2.0',
            method,
            ...(parameters !== undefined && { params: parameters }),
            id,
          });

          socket.write(`${payload}\n`);
        });
      };

      const client: IpcClient = {
        handshake: (clientVersion = '0.1.0') =>
          Effect.tryPromise({
            try: () => sendRpcRequest<HandshakeResult>(IPC_METHODS.HANDSHAKE, { clientVersion }),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        getNode: (id: string) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiNodePayload>(IPC_METHODS.QUERY_GET_NODE, { id }),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        getNodes: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<readonly ApiNodePayload[]>(
                IPC_METHODS.QUERY_GET_NODES,
                parameters ?? {},
              ),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        getEdge: (id: string) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiEdgePayload>(IPC_METHODS.QUERY_GET_EDGE, { id }),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        getEdges: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<readonly ApiEdgePayload[]>(
                IPC_METHODS.QUERY_GET_EDGES,
                parameters ?? {},
              ),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        executeQuery: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<readonly ApiNodePayload[]>(
                IPC_METHODS.QUERY_EXECUTE_QUERY,
                parameters ?? {},
              ),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        createNode: (parameters) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiNodePayload>(IPC_METHODS.MUTATION_CREATE_NODE, parameters),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        updateNodeProperties: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<ApiNodePayload>(
                IPC_METHODS.MUTATION_UPDATE_NODE_PROPERTIES,
                parameters,
              ),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        deleteNode: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<Readonly<{ id: string }>>(
                IPC_METHODS.MUTATION_DELETE_NODE,
                parameters,
              ),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        createEdge: (parameters) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiEdgePayload>(IPC_METHODS.MUTATION_CREATE_EDGE, parameters),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        deleteEdge: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<Readonly<{ id: string }>>(
                IPC_METHODS.MUTATION_DELETE_EDGE,
                parameters,
              ),
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        subscribe: (parameters, onEvent) =>
          Effect.tryPromise({
            try: async () => {
              const response = await sendRpcRequest<SubscribeResult>(
                IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
                parameters ?? {},
              );
              if (onEvent && response.subscriptionId) {
                // eslint-disable-next-line functional/immutable-data
                subscriptionCallbacks.set(response.subscriptionId, onEvent);
              }
              return response;
            },
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        unsubscribe: (subscriptionId) =>
          Effect.tryPromise({
            try: async () => {
              const response = await sendRpcRequest<UnsubscribeResult>(
                IPC_METHODS.EVENT_STREAM_UNSUBSCRIBE,
                { subscriptionId },
              );
              // eslint-disable-next-line functional/immutable-data
              subscriptionCallbacks.delete(subscriptionId);
              return response;
            },
            catch: (error) =>
              typeof error === 'object' &&
              error !== null &&
              '_tag' in error &&
              error._tag === 'IpcClientError'
                ? (error as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(error),
                  }),
          }),

        close: () =>
          Effect.sync(() => {
            // eslint-disable-next-line functional/immutable-data
            subscriptionCallbacks.clear();
            // eslint-disable-next-line functional/immutable-data
            pendingRequests.clear();
            socket.destroy();
          }),
      };

      resume(Effect.succeed(client));
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');

      // eslint-disable-next-line functional/no-let
      let newlineIndex = buffer.indexOf('\n');
      // eslint-disable-next-line functional/no-loop-statements
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          // eslint-disable-next-line functional/no-try-statements
          try {
            const rawObject = JSON.parse(line) as Readonly<{
              id?: JsonRpcId;
              method?: string;
              params?: Readonly<{ subscriptionId?: string; event?: unknown }>;
            }>;

            if (rawObject.method === IPC_METHODS.EVENT_STREAM_EVENT && rawObject.params) {
              const { subscriptionId, event } = rawObject.params;
              if (subscriptionId) {
                const callback = subscriptionCallbacks.get(subscriptionId);
                callback?.(event);
              }
            } else if (rawObject.id !== undefined && rawObject.id !== null) {
              const pending = pendingRequests.get(rawObject.id);
              if (pending) {
                // eslint-disable-next-line functional/immutable-data
                pendingRequests.delete(rawObject.id);
                pending.resolve(rawObject as JsonRpcResponse);
              }
            }
          } catch {
            // Ignore parse errors on response socket
          }
        }

        newlineIndex = buffer.indexOf('\n');
      }
    });

    socket.on('error', (error: Error) => {
      const clientError = createIpcClientError({
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: `Socket error: ${error.message}`,
      });

      // Reject all pending requests
      // eslint-disable-next-line functional/no-loop-statements
      for (const pending of pendingRequests.values()) {
        pending.reject(clientError);
      }
      // eslint-disable-next-line functional/immutable-data
      pendingRequests.clear();

      resume(Effect.fail(clientError));
    });
  });
};

export const createIpcClientLayer = (socketPath: string): Layer.Layer<IpcClient, IpcClientError> =>
  Layer.effect(IpcClientService, makeIpcClient(socketPath));
