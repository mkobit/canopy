/* eslint-disable max-lines-per-function */
import * as net from 'node:net';
import type { GraphAccessEdgePayload, GraphAccessNodePayload } from '@canopy/graph-access';
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

type PendingResponse = JsonRpcResponse | IpcClientError;

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

const removeMapKey = <K, V>(current: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> =>
  new Map([...current].filter(([candidate]) => candidate !== key));

const isIpcClientError = (response: PendingResponse): response is IpcClientError =>
  '_tag' in response && response._tag === 'IpcClientError';

export interface IpcClient {
  readonly handshake: (clientVersion?: string) => Effect.Effect<HandshakeResult, IpcClientError>;
  readonly getNode: (id: string) => Effect.Effect<GraphAccessNodePayload, IpcClientError>;
  readonly getNodes: (
    parameters?: Readonly<GetNodesParameters>,
  ) => Effect.Effect<readonly GraphAccessNodePayload[], IpcClientError>;
  readonly getEdge: (id: string) => Effect.Effect<GraphAccessEdgePayload, IpcClientError>;
  readonly getEdges: (
    parameters?: Readonly<GetEdgesParameters>,
  ) => Effect.Effect<readonly GraphAccessEdgePayload[], IpcClientError>;
  readonly executeQuery: (
    parameters?: Readonly<ExecuteQueryParameters>,
  ) => Effect.Effect<readonly GraphAccessNodePayload[], IpcClientError>;
  readonly createNode: (
    parameters: Readonly<CreateNodeParameters>,
  ) => Effect.Effect<GraphAccessNodePayload, IpcClientError>;
  readonly updateNodeProperties: (
    parameters: Readonly<UpdateNodePropertiesParameters>,
  ) => Effect.Effect<GraphAccessNodePayload, IpcClientError>;
  readonly deleteNode: (
    parameters: Readonly<DeleteNodeParameters>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly createEdge: (
    parameters: Readonly<CreateEdgeParameters>,
  ) => Effect.Effect<GraphAccessEdgePayload, IpcClientError>;
  readonly deleteEdge: (
    parameters: Readonly<DeleteEdgeParameters>,
  ) => Effect.Effect<Readonly<{ id: string }>, IpcClientError>;
  readonly subscribe: (
    parameters?: Readonly<SubscribeParameters>,
    onEvent?: (event: unknown) => unknown,
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

const tryParseJson = <T>(json: string): T | undefined => {
  // eslint-disable-next-line functional/no-try-statements -- JSON.parse boundary
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

export const makeIpcClient = (socketPath: string): Effect.Effect<IpcClient, IpcClientError> =>
  Effect.callback<IpcClient, IpcClientError>((resume) => {
    const pendingRequests = {
      current: new Map<JsonRpcId, (response: PendingResponse) => undefined>() as ReadonlyMap<
        JsonRpcId,
        (response: PendingResponse) => undefined
      >,
    };
    const subscriptionCallbacks = {
      current: new Map<string, (event: unknown) => unknown>() as ReadonlyMap<
        string,
        (event: unknown) => unknown
      >,
    };
    const requestCounter = { current: 0 };
    const streamBuffer = { current: '' };
    const terminated = { current: false };
    const connected = { current: false };
    const connectResult = Effect.runSync(
      Effect.result(
        Effect.try({
          try: () => net.connect(socketPath),
          catch: (error) =>
            createIpcClientError({
              code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
              message: `Socket error: ${error instanceof Error ? error.message : String(error)}`,
            }),
        }),
      ),
    );

    if (connectResult._tag === 'Failure') {
      resume(Effect.fail(connectResult.failure));
      return undefined;
    }

    const socket = connectResult.success;

    const releaseSocket = (): undefined => {
      socket.off('connect', onConnect);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('end', onEnd);
      socket.destroy();
      return undefined;
    };

    const settlePending = (
      pending: readonly ((response: PendingResponse) => undefined)[],
      error: IpcClientError,
      index = 0,
    ): boolean => {
      const settle = pending[index];
      if (settle === undefined) return true;
      settle(error);
      return settlePending(pending, error, index + 1);
    };

    const terminate = (error: IpcClientError): boolean => {
      if (terminated.current) return true;
      terminated.current = true;
      subscriptionCallbacks.current = new Map();
      const pending = [...pendingRequests.current.values()];
      pendingRequests.current = new Map();
      settlePending(pending, error);
      releaseSocket();
      if (!connected.current) resume(Effect.fail(error));
      return true;
    };

    const request = <A>(method: string, parameters?: unknown): Effect.Effect<A, IpcClientError> =>
      Effect.callback<A, IpcClientError>((resumeRequest) => {
        if (terminated.current) {
          resumeRequest(
            Effect.fail(
              createIpcClientError({
                code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                message: 'Socket is closed',
              }),
            ),
          );
          return Effect.void;
        }

        requestCounter.current += 1;
        const id = requestCounter.current;
        const settle = (response: PendingResponse): undefined => {
          if (isIpcClientError(response)) {
            resumeRequest(Effect.fail(response));
            return undefined;
          }
          if (response.error) {
            resumeRequest(
              Effect.fail(
                createIpcClientError({
                  code: response.error.code,
                  message: response.error.message,
                  details: response.error.data,
                }),
              ),
            );
            return undefined;
          }
          resumeRequest(Effect.succeed(response.result as A));
          return undefined;
        };
        pendingRequests.current = new Map([...pendingRequests.current, [id, settle]]);

        const writeResult = Effect.runSync(
          Effect.result(
            Effect.try({
              try: () =>
                socket.write(
                  `${JSON.stringify({
                    jsonrpc: '2.0',
                    method,
                    ...(parameters !== undefined && { params: parameters }),
                    id,
                  })}\n`,
                ),
              catch: (error) =>
                createIpcClientError({
                  code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                  message: String(error),
                }),
            }),
          ),
        );

        if (writeResult._tag === 'Failure') {
          pendingRequests.current = removeMapKey(pendingRequests.current, id);
          resumeRequest(Effect.fail(writeResult.failure));
          return Effect.void;
        }

        return Effect.sync(() => {
          pendingRequests.current = removeMapKey(pendingRequests.current, id);
          return undefined;
        });
      });

    const client: IpcClient = {
      handshake: (clientVersion = '0.1.0') => request(IPC_METHODS.HANDSHAKE, { clientVersion }),
      getNode: (id) => request(IPC_METHODS.QUERY_GET_NODE, { id }),
      getNodes: (parameters) => request(IPC_METHODS.QUERY_GET_NODES, parameters ?? {}),
      getEdge: (id) => request(IPC_METHODS.QUERY_GET_EDGE, { id }),
      getEdges: (parameters) => request(IPC_METHODS.QUERY_GET_EDGES, parameters ?? {}),
      executeQuery: (parameters) => request(IPC_METHODS.QUERY_EXECUTE_QUERY, parameters ?? {}),
      createNode: (parameters) => request(IPC_METHODS.MUTATION_CREATE_NODE, parameters),
      updateNodeProperties: (parameters) =>
        request(IPC_METHODS.MUTATION_UPDATE_NODE_PROPERTIES, parameters),
      deleteNode: (parameters) => request(IPC_METHODS.MUTATION_DELETE_NODE, parameters),
      createEdge: (parameters) => request(IPC_METHODS.MUTATION_CREATE_EDGE, parameters),
      deleteEdge: (parameters) => request(IPC_METHODS.MUTATION_DELETE_EDGE, parameters),
      subscribe: (parameters, onEvent) =>
        Effect.map(
          request<SubscribeResult>(IPC_METHODS.EVENT_STREAM_SUBSCRIBE, parameters ?? {}),
          (response) => {
            if (onEvent && response.subscriptionId) {
              subscriptionCallbacks.current = new Map([
                ...subscriptionCallbacks.current,
                [response.subscriptionId, onEvent],
              ]);
            }
            return response;
          },
        ),
      unsubscribe: (subscriptionId) =>
        Effect.map(
          request<UnsubscribeResult>(IPC_METHODS.EVENT_STREAM_UNSUBSCRIBE, { subscriptionId }),
          (response) => {
            subscriptionCallbacks.current = removeMapKey(
              subscriptionCallbacks.current,
              subscriptionId,
            );
            return response;
          },
        ),
      draftCreate: () => request(IPC_METHODS.DRAFT_CREATE),
      draftApply: (parameters) => request(IPC_METHODS.DRAFT_APPLY, parameters),
      draftPreview: (parameters) => request(IPC_METHODS.DRAFT_PREVIEW, parameters),
      draftCommit: (parameters) => request(IPC_METHODS.DRAFT_COMMIT, parameters),
      draftDiscard: (parameters) => request(IPC_METHODS.DRAFT_DISCARD, parameters),
      close: () =>
        Effect.asVoid(
          Effect.sync(() =>
            terminate(
              createIpcClientError({
                code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                message: 'Socket closed by client',
              }),
            ),
          ),
        ),
    };

    const onConnect = (): boolean => {
      if (terminated.current) return true;
      connected.current = true;
      resume(Effect.succeed(client));
      return true;
    };

    const processLines = (lines: readonly string[], index = 0): boolean => {
      const line = lines[index];
      if (line === undefined) return true;
      const response = tryParseJson<
        JsonRpcResponse &
          Readonly<{
            method?: string;
            params?: Readonly<{ subscriptionId?: string; event?: unknown }>;
          }>
      >(line.trim());
      if (response) {
        if (response.method === IPC_METHODS.EVENT_STREAM_EVENT && response.params) {
          const { subscriptionId, event } = response.params;
          if (subscriptionId) subscriptionCallbacks.current.get(subscriptionId)?.(event);
        } else if (response.id !== undefined && response.id !== null) {
          const settle = pendingRequests.current.get(response.id);
          if (settle) {
            pendingRequests.current = removeMapKey(pendingRequests.current, response.id);
            settle(response);
          }
        }
      }
      return processLines(lines, index + 1);
    };

    const onData = (chunk: Buffer): boolean => {
      const combined = streamBuffer.current + chunk.toString('utf8');
      const lastNewline = combined.lastIndexOf('\n');
      if (lastNewline === -1) {
        streamBuffer.current = combined;
        return true;
      }
      const completeLines = combined.slice(0, lastNewline).split('\n');
      streamBuffer.current = combined.slice(lastNewline + 1);
      processLines(completeLines);
      return true;
    };

    const onError = (error: Error): boolean => {
      terminate(
        createIpcClientError({
          code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          message: `Socket error: ${error.message}`,
        }),
      );
      return true;
    };

    const onClose = (): boolean => {
      terminate(
        createIpcClientError({
          code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          message: 'Socket closed by peer',
        }),
      );
      return true;
    };

    const onEnd = (): boolean => {
      terminate(
        createIpcClientError({
          code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          message: 'Socket closed by peer',
        }),
      );
      return true;
    };

    socket.on('connect', onConnect);
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
    socket.on('end', onEnd);

    return Effect.sync(() => {
      if (terminated.current) return undefined;
      terminated.current = true;
      subscriptionCallbacks.current = new Map();
      pendingRequests.current = new Map();
      releaseSocket();
      return undefined;
    });
  });
