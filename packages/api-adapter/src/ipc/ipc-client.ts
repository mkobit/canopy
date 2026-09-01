/* eslint-disable functional/no-return-void, functional/prefer-tacit, max-lines-per-function */
import * as net from 'node:net';
import { err, ok } from '@canopy/graph';
import type { ApiEdgePayload, ApiNodePayload } from '../api-payloads';
import type {
  CreateEdgeParams as CreateEdgeParameters,
  CreateNodeParams as CreateNodeParameters,
  DeleteEdgeParams as DeleteEdgeParameters,
  DeleteNodeParams as DeleteNodeParameters,
  DraftApplyParamsInput as DraftApplyParameters,
  DraftApplyResult,
  DraftCommitParams as DraftCommitParameters,
  DraftCreateResult,
  DraftDiscardParams as DraftDiscardParameters,
  DraftPreviewParams as DraftPreviewParameters,
  DraftPreviewResult,
  ExecuteQueryParams as ExecuteQueryParameters,
  GetEdgesParams as GetEdgesParameters,
  GetNodesParams as GetNodesParameters,
  HandshakeResult,
  JsonRpcId,
  JsonRpcResponse,
  SubscribeParams as SubscribeParameters,
  SubscribeResult,
  UnsubscribeResult,
  UpdateNodePropertiesParams as UpdateNodePropertiesParameters,
} from './ipc-schema';
import { IPC_METHODS, JSON_RPC_ERROR_CODES } from './ipc-schema';
import { Effect } from 'effect';

export type IpcClientError = Readonly<{
  _tag: 'IpcClientError';
  code: number;
  message: string;
  details?: unknown;
}>;

const createIpcClientError = (
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
    parameters?: Readonly<GetNodesParameters>,
  ) => Effect.Effect<readonly ApiNodePayload[], IpcClientError>;
  readonly getEdge: (id: string) => Effect.Effect<ApiEdgePayload, IpcClientError>;
  readonly getEdges: (
    parameters?: Readonly<GetEdgesParameters>,
  ) => Effect.Effect<readonly ApiEdgePayload[], IpcClientError>;
  readonly executeQuery: (
    parameters?: Readonly<ExecuteQueryParameters>,
  ) => Effect.Effect<readonly ApiNodePayload[], IpcClientError>;
  readonly createNode: (
    parameters: Readonly<CreateNodeParameters>,
  ) => Effect.Effect<ApiNodePayload, IpcClientError>;
  readonly updateNodeProperties: (
    parameters: Readonly<UpdateNodePropertiesParameters>,
  ) => Effect.Effect<ApiNodePayload, IpcClientError>;
  readonly deleteNode: (
    parameters: Readonly<DeleteNodeParameters>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly createEdge: (
    parameters: Readonly<CreateEdgeParameters>,
  ) => Effect.Effect<ApiEdgePayload, IpcClientError>;
  readonly deleteEdge: (
    parameters: Readonly<DeleteEdgeParameters>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly subscribe: (
    parameters?: Readonly<SubscribeParameters>,
    onEvent?: (event: unknown) => void,
  ) => Effect.Effect<SubscribeResult, IpcClientError>;
  readonly unsubscribe: (
    subscriptionId: string,
  ) => Effect.Effect<UnsubscribeResult, IpcClientError>;
  readonly draftCreate: () => Effect.Effect<DraftCreateResult, IpcClientError>;
  readonly draftApply: (
    parameters: Readonly<DraftApplyParameters>,
  ) => Effect.Effect<DraftApplyResult, IpcClientError>;
  readonly draftPreview: (
    parameters: Readonly<DraftPreviewParameters>,
  ) => Effect.Effect<DraftPreviewResult, IpcClientError>;
  readonly draftCommit: (
    parameters: Readonly<DraftCommitParameters>,
  ) => Effect.Effect<Readonly<{ success: boolean }>, IpcClientError>;
  readonly draftDiscard: (
    parameters: Readonly<DraftDiscardParameters>,
  ) => Effect.Effect<Readonly<{ success: boolean }>, IpcClientError>;
  readonly close: () => Effect.Effect<void, never>;
}

export const makeIpcClient = (socketPath: string): Effect.Effect<IpcClient, IpcClientError> => {
  return Effect.async<IpcClient, IpcClientError>((resume) => {
    const requestCounter = { current: 0 };
    const pendingRequests = {
      current: new Map<
        JsonRpcId,
        { resolve: (response: JsonRpcResponse) => void; reject: (error: IpcClientError) => void }
      >(),
    };
    const subscriptionCallbacks = {
      current: new Map<string, (event: unknown) => void>(),
    };
    const streamBuffer = { current: '' };

    // net.connect() can throw synchronously for some immediately-knowable
    // failures (e.g. ENOENT on a Unix domain socket path with no listener --
    // observed as a sync throw under bun's stricter runtime/test semantics,
    // vs. an async 'error' event elsewhere) rather than only failing async
    // via the 'error' event below. Catching it here keeps both paths
    // reporting through the same resume(Effect.fail(...)) channel instead of
    // letting a sync throw escape Effect.async's registration uncaught.
    const connectResult = (() => {
      // eslint-disable-next-line functional/no-try-statements -- net.connect sync throw guard
      try {
        return ok(net.connect(socketPath));
      } catch (error) {
        return err(
          createIpcClientError({
            code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
            message: `Socket error: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      }
    })();

    if (!connectResult.ok) {
      resume(Effect.fail(connectResult.error));
      return;
    }
    const socket = connectResult.value;

    socket.on('connect', () => {
      // eslint-disable-next-line unicorn/consistent-function-scoping
      const sendRpcRequest = <T>(method: string, parameters?: unknown): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
          requestCounter.current += 1;
          const id = requestCounter.current;

          pendingRequests.current = new Map([
            ...pendingRequests.current,
            [
              id,
              {
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
              },
            ],
          ]);

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
                subscriptionCallbacks.current = new Map([
                  ...subscriptionCallbacks.current,
                  [response.subscriptionId, onEvent],
                ]);
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
              subscriptionCallbacks.current = new Map(
                [...subscriptionCallbacks.current].filter(([id]) => id !== subscriptionId),
              );
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

        draftCreate: () =>
          Effect.tryPromise({
            try: () => sendRpcRequest<DraftCreateResult>(IPC_METHODS.DRAFT_CREATE),
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

        draftApply: (parameters) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<DraftApplyResult>(IPC_METHODS.DRAFT_APPLY, parameters),
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

        draftPreview: (parameters) =>
          Effect.tryPromise({
            try: () => sendRpcRequest<DraftPreviewResult>(IPC_METHODS.DRAFT_PREVIEW, parameters),
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

        draftCommit: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<Readonly<{ success: boolean }>>(IPC_METHODS.DRAFT_COMMIT, parameters),
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

        draftDiscard: (parameters) =>
          Effect.tryPromise({
            try: () =>
              sendRpcRequest<Readonly<{ success: boolean }>>(IPC_METHODS.DRAFT_DISCARD, parameters),
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
            subscriptionCallbacks.current = new Map();
            pendingRequests.current = new Map();
            socket.destroy();
          }),
      };

      resume(Effect.succeed(client));
    });

    socket.on('data', (chunk: Buffer) => {
      const combined = streamBuffer.current + chunk.toString('utf8');
      const lastNewline = combined.lastIndexOf('\n');
      if (lastNewline === -1) {
        streamBuffer.current = combined;
        return;
      }

      const completeLines = combined.slice(0, lastNewline).split('\n');
      streamBuffer.current = combined.slice(lastNewline + 1);

      // eslint-disable-next-line functional/no-loop-statements
      for (const rawLine of completeLines) {
        const line = rawLine.trim();
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
                const callback = subscriptionCallbacks.current.get(subscriptionId);
                callback?.(event);
              }
            } else if (rawObject.id !== undefined && rawObject.id !== null) {
              const pending = pendingRequests.current.get(rawObject.id);
              if (pending) {
                pendingRequests.current = new Map(
                  [...pendingRequests.current].filter(([id]) => id !== rawObject.id),
                );
                pending.resolve(rawObject as JsonRpcResponse);
              }
            }
          } catch {
            // Ignore parse errors on response socket
          }
        }
      }
    });

    socket.on('error', (error: Error) => {
      const clientError = createIpcClientError({
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: `Socket error: ${error.message}`,
      });

      // Reject all pending requests
      // eslint-disable-next-line functional/no-loop-statements
      for (const pending of pendingRequests.current.values()) {
        pending.reject(clientError);
      }
      pendingRequests.current = new Map();

      resume(Effect.fail(clientError));
    });
  });
};
