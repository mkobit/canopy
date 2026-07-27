/* eslint-disable functional/no-return-void, functional/prefer-tacit, max-lines-per-function */
import * as net from 'node:net';
import type {
  ApiEdgePayload,
  ApiNodePayload,
  CreateEdgeParams,
  CreateNodeParams,
  DeleteEdgeParams,
  DeleteNodeParams,
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
    params?: Readonly<GetNodesParams>,
  ) => Effect.Effect<readonly ApiNodePayload[], IpcClientError>;
  readonly getEdge: (id: string) => Effect.Effect<ApiEdgePayload, IpcClientError>;
  readonly getEdges: (
    params?: Readonly<GetEdgesParams>,
  ) => Effect.Effect<readonly ApiEdgePayload[], IpcClientError>;
  readonly createNode: (
    params: Readonly<CreateNodeParams>,
  ) => Effect.Effect<ApiNodePayload, IpcClientError>;
  readonly updateNodeProperties: (
    params: Readonly<UpdateNodePropertiesParams>,
  ) => Effect.Effect<ApiNodePayload, IpcClientError>;
  readonly deleteNode: (
    params: Readonly<DeleteNodeParams>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly createEdge: (
    params: Readonly<CreateEdgeParams>,
  ) => Effect.Effect<ApiEdgePayload, IpcClientError>;
  readonly deleteEdge: (
    params: Readonly<DeleteEdgeParams>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly subscribe: (
    params?: Readonly<SubscribeParams>,
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
    let reqCounter = 0;
    const pendingRequests = new Map<
      JsonRpcId,
      { resolve: (res: JsonRpcResponse) => void; reject: (err: IpcClientError) => void }
    >();
    const subscriptionCallbacks = new Map<string, (event: unknown) => void>();

    // eslint-disable-next-line functional/no-let
    let buffer = '';
    const socket = net.connect(socketPath);

    socket.on('connect', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping
      const sendRpcRequest = <T>(method: string, params?: unknown): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
          reqCounter += 1;
          const id = reqCounter;

          // eslint-disable-next-line functional/immutable-data
          pendingRequests.set(id, {
            resolve: (res: JsonRpcResponse) => {
              if (res.error) {
                reject(
                  createIpcClientError({
                    code: res.error.code,
                    message: res.error.message,
                    details: res.error.data,
                  }),
                );
              } else {
                resolve(res.result as T);
              }
            },
            reject: (err: IpcClientError) => reject(err),
          });

          const payload = JSON.stringify({
            jsonrpc: '2.0',
            method,
            ...(params !== undefined && { params }),
            id,
          });

          socket.write(`${payload}\n`);
        });
      };

      const client: IpcClient = {
        handshake: (clientVersion = '0.1.0') =>
          Effect.tryPromise({
            try: () => sendRpcRequest<HandshakeResult>(IPC_METHODS.HANDSHAKE, { clientVersion }),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        getNode: (id: string) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiNodePayload>(IPC_METHODS.QUERY_GET_NODE, { id }),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        getNodes: (params) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<readonly ApiNodePayload[]>(IPC_METHODS.QUERY_GET_NODES, params ?? {}),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        getEdge: (id: string) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiEdgePayload>(IPC_METHODS.QUERY_GET_EDGE, { id }),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        getEdges: (params) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<readonly ApiEdgePayload[]>(IPC_METHODS.QUERY_GET_EDGES, params ?? {}),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        createNode: (params) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiNodePayload>(IPC_METHODS.MUTATION_CREATE_NODE, params),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        updateNodeProperties: (params) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<ApiNodePayload>(IPC_METHODS.MUTATION_UPDATE_NODE_PROPERTIES, params),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        deleteNode: (params) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<Readonly<{ id: string }>>(IPC_METHODS.MUTATION_DELETE_NODE, params),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        createEdge: (params) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<ApiEdgePayload>(IPC_METHODS.MUTATION_CREATE_EDGE, params),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        deleteEdge: (params) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<Readonly<{ id: string }>>(IPC_METHODS.MUTATION_DELETE_EDGE, params),
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        subscribe: (params, onEvent) =>
          Effect.tryPromise({
            try: async () => {
              const res = await sendRpcRequest<SubscribeResult>(
                IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
                params ?? {},
              );
              if (onEvent && res.subscriptionId) {
                // eslint-disable-next-line functional/immutable-data
                subscriptionCallbacks.set(res.subscriptionId, onEvent);
              }
              return res;
            },
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
                  }),
          }),

        unsubscribe: (subscriptionId) =>
          Effect.tryPromise({
            try: async () => {
              const res = await sendRpcRequest<UnsubscribeResult>(
                IPC_METHODS.EVENT_STREAM_UNSUBSCRIBE,
                { subscriptionId },
              );
              // eslint-disable-next-line functional/immutable-data
              subscriptionCallbacks.delete(subscriptionId);
              return res;
            },
            catch: (err) =>
              typeof err === 'object' &&
              err !== null &&
              '_tag' in err &&
              err._tag === 'IpcClientError'
                ? (err as IpcClientError)
                : createIpcClientError({
                    code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    message: String(err),
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
            const rawObj = JSON.parse(line) as Readonly<{
              id?: JsonRpcId;
              method?: string;
              params?: Readonly<{ subscriptionId?: string; event?: unknown }>;
            }>;

            if (rawObj.method === IPC_METHODS.EVENT_STREAM_EVENT && rawObj.params) {
              const { subscriptionId, event } = rawObj.params;
              if (subscriptionId) {
                const callback = subscriptionCallbacks.get(subscriptionId);
                callback?.(event);
              }
            } else if (rawObj.id !== undefined && rawObj.id !== null) {
              const pending = pendingRequests.get(rawObj.id);
              if (pending) {
                // eslint-disable-next-line functional/immutable-data
                pendingRequests.delete(rawObj.id);
                pending.resolve(rawObj as JsonRpcResponse);
              }
            }
          } catch {
            // Ignore parse errors on response socket
          }
        }

        newlineIndex = buffer.indexOf('\n');
      }
    });

    socket.on('error', (err: Error) => {
      const clientErr = createIpcClientError({
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: `Socket error: ${err.message}`,
      });

      // Reject all pending requests
      // eslint-disable-next-line functional/no-loop-statements
      for (const pending of pendingRequests.values()) {
        pending.reject(clientErr);
      }
      // eslint-disable-next-line functional/immutable-data
      pendingRequests.clear();

      resume(Effect.fail(clientErr));
    });
  });
};

export const createIpcClientLayer = (socketPath: string): Layer.Layer<IpcClient, IpcClientError> =>
  Layer.effect(IpcClientService, makeIpcClient(socketPath));
