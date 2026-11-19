import { err, ok } from '@canopy/graph';
import type {
  CanopyV0CommitDraftRequest,
  CanopyV0CommitTransactionRequest,
  CanopyV0CommitTransactionResponse,
  CanopyV0CreateDraftRequest,
  CanopyV0CreateGraphRequest,
  CanopyV0DeleteGraphRequest,
  CanopyV0DeleteGraphResponse,
  CanopyV0DiscardDraftRequest,
  CanopyV0DraftRecord,
  CanopyV0ExecuteStoredQueryRequest,
  CanopyV0ExecuteStoredQueryResponse,
  CanopyV0GetDraftRequest,
  CanopyV0GetGraphRequest,
  CanopyV0GetSchemaRequest,
  CanopyV0GetViewDefinitionRequest,
  CanopyV0GraphSchemaResponse,
  CanopyV0GraphSummary,
  CanopyV0HistorySnapshotRequest,
  CanopyV0HistorySnapshotResponse,
  CanopyV0InstallBundleRequest,
  CanopyV0InstallBundleResponse,
  CanopyV0ListBundlesRequest,
  CanopyV0ListBundlesResponse,
  CanopyV0ListGraphsRequest,
  CanopyV0ListGraphsResponse,
  CanopyV0LookupPropertiesRequest,
  CanopyV0LookupPropertiesResponse,
  CanopyV0QueryEdgesRequest,
  CanopyV0QueryEdgesResponse,
  CanopyV0QueryNodesRequest,
  CanopyV0QueryNodesResponse,
  CanopyV0RegisterShapeMigrationRequest,
  CanopyV0ResolveSettingRequest,
  CanopyV0ResolveSettingResponse,
  CanopyV0ResolveViewRequest,
  CanopyV0ResolveViewResponse,
  CanopyV0RouteDescriptor,
  CanopyV0RouteOperationId,
  CanopyV0ServiceHandlers,
  CanopyV0ShapeMigrationRecord,
  CanopyV0StageDraftOperationsRequest,
  CanopyV0StreamReplayRequest,
  CanopyV0StreamReplayResponse,
  CanopyV0StreamSubscribeRequest,
  CanopyV0TraverseGraphRequest,
  CanopyV0TraverseGraphResponse,
  CanopyV0ViewDefinitionRecord,
} from './canopy-v0-contract';
import { CANOPY_V0_ROUTES } from './canopy-v0-contract';
import type { CanopyV0ServerRouter } from './canopy-v0-server';
import type { GraphAccessResponse } from './graph-access-payloads';
import {
  createGraphAccessError,
  type GraphAccessError,
  type GraphAccessErrorCategory,
} from './result-errors';

export interface CanopyV0Transport {
  readonly invoke: <TResponse>(
    route: CanopyV0RouteDescriptor,
    request: unknown,
  ) => Promise<GraphAccessResponse<TResponse>>;
}

export type CanopyV0FetchFunction = (
  input: string,
  init?: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: string;
  }>,
) => Promise<Response>;

export interface CanopyV0FetchTransportOptions {
  readonly baseUrl: string;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly fetch?: CanopyV0FetchFunction | undefined;
}

export interface CanopyV0ClientGraphs {
  readonly listGraphs: (
    request?: CanopyV0ListGraphsRequest,
  ) => Promise<GraphAccessResponse<CanopyV0ListGraphsResponse>>;
  readonly createGraph: (
    request: CanopyV0CreateGraphRequest,
  ) => Promise<GraphAccessResponse<CanopyV0GraphSummary>>;
  readonly getGraph: (
    request: CanopyV0GetGraphRequest,
  ) => Promise<GraphAccessResponse<CanopyV0GraphSummary>>;
  readonly deleteGraph: (
    request: CanopyV0DeleteGraphRequest,
  ) => Promise<GraphAccessResponse<CanopyV0DeleteGraphResponse>>;
}

export interface CanopyV0Client {
  readonly graphs: CanopyV0ClientGraphs;
  readonly transactions: CanopyV0ServiceHandlers['transactions'];
  readonly queries: CanopyV0ServiceHandlers['queries'];
  readonly views: CanopyV0ServiceHandlers['views'];
  readonly bundles: CanopyV0ServiceHandlers['bundles'];
  readonly streams: CanopyV0ServiceHandlers['streams'];
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const interpolatePath = (
  patternPath: string,
  inputRecord: Readonly<Record<string, unknown>>,
): string =>
  patternPath
    .split('/')
    .map((segment) => {
      if (!segment.startsWith('{') || !segment.endsWith('}')) return segment;
      const key = segment.slice(1, -1);
      const rawValue = inputRecord[key];
      return encodeURIComponent(typeof rawValue === 'string' ? rawValue : String(rawValue ?? ''));
    })
    .join('/');

const buildResolvedRoute = (
  route: CanopyV0RouteDescriptor,
  request: unknown,
): Readonly<{
  path: string;
  query: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>> | undefined;
}> => {
  const inputRecord = isRecord(request) ? request : {};
  const pathParameterSet = new Set(route.pathParams);
  const path = interpolatePath(route.path, inputRecord);

  const nonPathEntries = Object.entries(inputRecord).filter(
    ([key, value]) => !pathParameterSet.has(key) && value !== undefined,
  );

  if (route.method === 'GET' || route.method === 'DELETE') {
    const queryEntries = nonPathEntries.flatMap(
      ([key, value]): readonly (readonly [string, string])[] =>
        key === 'consistency' && isRecord(value)
          ? Object.entries(value)
              .filter(([, nested]) => nested !== undefined)
              .map(([nestedKey, nestedValue]) => [nestedKey, String(nestedValue)] as const)
          : ([[key, String(value)] as const] as const),
    );
    return {
      path,
      query: Object.fromEntries(queryEntries),
      body: undefined,
    };
  }

  return {
    path,
    query: {},
    body: Object.fromEntries(nonPathEntries),
  };
};

export const createInProcessCanopyV0Transport = (
  router: CanopyV0ServerRouter,
): CanopyV0Transport => ({
  invoke: async <TResponse>(
    route: CanopyV0RouteDescriptor,
    request: unknown,
  ): Promise<GraphAccessResponse<TResponse>> => {
    const resolved = buildResolvedRoute(route, request);
    const response = await router.dispatch({
      method: route.method,
      path: resolved.path,
      query: resolved.query,
      ...(resolved.body !== undefined && { body: resolved.body }),
    });
    return response.body as GraphAccessResponse<TResponse>;
  },
});

const statusToErrorCategory = (status: number): GraphAccessErrorCategory => {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONCURRENCY_CONFLICT';
  return status === 429 ? 'RESOURCE_EXHAUSTED' : 'INTERNAL_ERROR';
};

const isGraphAccessErrorShape = (value: unknown): value is GraphAccessError =>
  isRecord(value) &&
  typeof value.category === 'string' &&
  typeof value.message === 'string' &&
  typeof value.code === 'string';

const unwrapOkEnvelope = <TResponse>(payload: unknown): GraphAccessResponse<TResponse> => {
  if (isRecord(payload) && payload.ok === true && 'value' in payload) {
    return ok(payload.value as TResponse);
  }
  return isRecord(payload) && payload.ok === false && isGraphAccessErrorShape(payload.error)
    ? err(payload.error)
    : ok(payload as TResponse);
};

const extractErrorFromPayload = (
  payload: unknown,
  status: number,
  statusText: string,
): GraphAccessError => {
  if (isRecord(payload) && isGraphAccessErrorShape(payload.error)) {
    return payload.error;
  }
  return isGraphAccessErrorShape(payload)
    ? payload
    : createGraphAccessError(statusToErrorCategory(status), `HTTP ${status} ${statusText}`.trim());
};

const readFetchResponseBody = async <TResponse>(
  response: Response,
): Promise<GraphAccessResponse<TResponse>> => {
  const parsedBody = await response.json().catch(() => undefined);
  return response.ok
    ? unwrapOkEnvelope<TResponse>(parsedBody)
    : err(extractErrorFromPayload(parsedBody, response.status, response.statusText));
};

export const createFetchCanopyV0Transport = (
  options: CanopyV0FetchTransportOptions,
): CanopyV0Transport => {
  const cleanBaseUrl = options.baseUrl.endsWith('/')
    ? options.baseUrl.slice(0, -1)
    : options.baseUrl;
  const fetchFunction: CanopyV0FetchFunction = options.fetch ?? fetch;
  const defaultHeaders = options.headers ?? {};

  return {
    invoke: <TResponse>(
      route: CanopyV0RouteDescriptor,
      request: unknown,
    ): Promise<GraphAccessResponse<TResponse>> => {
      const resolved = buildResolvedRoute(route, request);
      const searchParameters = new URLSearchParams(resolved.query);
      const queryString = searchParameters.toString();
      const url = `${cleanBaseUrl}${resolved.path}${queryString.length > 0 ? `?${queryString}` : ''}`;

      return fetchFunction(url, {
        method: route.method,
        headers: {
          'Content-Type': 'application/json',
          ...defaultHeaders,
        },
        ...(resolved.body !== undefined && { body: JSON.stringify(resolved.body) }),
      })
        .then(readFetchResponseBody<TResponse>)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return err(
            createGraphAccessError('INTERNAL_ERROR', `Transport request failed: ${message}`),
          );
        });
    },
  };
};

const ROUTE_BY_ID: ReadonlyMap<CanopyV0RouteOperationId, CanopyV0RouteDescriptor> = new Map(
  CANOPY_V0_ROUTES.map((route) => [route.id, route] as const),
);

const callRoute = <TRequest, TResponse>(
  transport: CanopyV0Transport,
  operationId: CanopyV0RouteOperationId,
  request: TRequest,
): Promise<GraphAccessResponse<TResponse>> => {
  const route = ROUTE_BY_ID.get(operationId);
  return route
    ? transport.invoke<TResponse>(route, request)
    : Promise.resolve(
        err(createGraphAccessError('INTERNAL_ERROR', `Unknown TypeSpec route: ${operationId}`)),
      );
};

const createGraphsClient = (transport: CanopyV0Transport): CanopyV0ClientGraphs => ({
  listGraphs: (request: CanopyV0ListGraphsRequest = {}) =>
    callRoute<CanopyV0ListGraphsRequest, CanopyV0ListGraphsResponse>(
      transport,
      'Graphs.listGraphs',
      request,
    ),
  createGraph: (request: CanopyV0CreateGraphRequest) =>
    callRoute<CanopyV0CreateGraphRequest, CanopyV0GraphSummary>(
      transport,
      'Graphs.createGraph',
      request,
    ),
  getGraph: (request: CanopyV0GetGraphRequest) =>
    callRoute<CanopyV0GetGraphRequest, CanopyV0GraphSummary>(transport, 'Graphs.getGraph', request),
  deleteGraph: (request: CanopyV0DeleteGraphRequest) =>
    callRoute<CanopyV0DeleteGraphRequest, CanopyV0DeleteGraphResponse>(
      transport,
      'Graphs.deleteGraph',
      request,
    ),
});

const createTransactionsClient = (
  transport: CanopyV0Transport,
): CanopyV0ServiceHandlers['transactions'] => ({
  commitTransaction: (request: CanopyV0CommitTransactionRequest) =>
    callRoute<CanopyV0CommitTransactionRequest, CanopyV0CommitTransactionResponse>(
      transport,
      'Transactions.commitTransaction',
      request,
    ),
  createDraft: (request: CanopyV0CreateDraftRequest) =>
    callRoute<CanopyV0CreateDraftRequest, CanopyV0DraftRecord>(
      transport,
      'Transactions.createDraft',
      request,
    ),
  getDraft: (request: CanopyV0GetDraftRequest) =>
    callRoute<CanopyV0GetDraftRequest, CanopyV0DraftRecord>(
      transport,
      'Transactions.getDraft',
      request,
    ),
  stageDraftOperations: (request: CanopyV0StageDraftOperationsRequest) =>
    callRoute<CanopyV0StageDraftOperationsRequest, CanopyV0DraftRecord>(
      transport,
      'Transactions.stageDraftOperations',
      request,
    ),
  commitDraft: (request: CanopyV0CommitDraftRequest) =>
    callRoute<CanopyV0CommitDraftRequest, CanopyV0CommitTransactionResponse>(
      transport,
      'Transactions.commitDraft',
      request,
    ),
  discardDraft: (request: CanopyV0DiscardDraftRequest) =>
    callRoute<CanopyV0DiscardDraftRequest, CanopyV0DraftRecord>(
      transport,
      'Transactions.discardDraft',
      request,
    ),
});

const createQueriesClient = (transport: CanopyV0Transport): CanopyV0ServiceHandlers['queries'] => ({
  queryNodes: (request: CanopyV0QueryNodesRequest) =>
    callRoute<CanopyV0QueryNodesRequest, CanopyV0QueryNodesResponse>(
      transport,
      'Queries.queryNodes',
      request,
    ),
  queryEdges: (request: CanopyV0QueryEdgesRequest) =>
    callRoute<CanopyV0QueryEdgesRequest, CanopyV0QueryEdgesResponse>(
      transport,
      'Queries.queryEdges',
      request,
    ),
  lookupProperties: (request: CanopyV0LookupPropertiesRequest) =>
    callRoute<CanopyV0LookupPropertiesRequest, CanopyV0LookupPropertiesResponse>(
      transport,
      'Queries.lookupProperties',
      request,
    ),
  traverseGraph: (request: CanopyV0TraverseGraphRequest) =>
    callRoute<CanopyV0TraverseGraphRequest, CanopyV0TraverseGraphResponse>(
      transport,
      'Queries.traverseGraph',
      request,
    ),
  executeStoredQuery: (request: CanopyV0ExecuteStoredQueryRequest) =>
    callRoute<CanopyV0ExecuteStoredQueryRequest, CanopyV0ExecuteStoredQueryResponse>(
      transport,
      'Queries.executeStoredQuery',
      request,
    ),
  getHistorySnapshot: (request: CanopyV0HistorySnapshotRequest) =>
    callRoute<CanopyV0HistorySnapshotRequest, CanopyV0HistorySnapshotResponse>(
      transport,
      'Queries.getHistorySnapshot',
      request,
    ),
});

const createViewsClient = (transport: CanopyV0Transport): CanopyV0ServiceHandlers['views'] => ({
  resolveView: (request: CanopyV0ResolveViewRequest) =>
    callRoute<CanopyV0ResolveViewRequest, CanopyV0ResolveViewResponse>(
      transport,
      'Views.resolveView',
      request,
    ),
  getViewDefinition: (request: CanopyV0GetViewDefinitionRequest) =>
    callRoute<CanopyV0GetViewDefinitionRequest, CanopyV0ViewDefinitionRecord>(
      transport,
      'Views.getViewDefinition',
      request,
    ),
  resolveSetting: (request: CanopyV0ResolveSettingRequest) =>
    callRoute<CanopyV0ResolveSettingRequest, CanopyV0ResolveSettingResponse>(
      transport,
      'Views.resolveSetting',
      request,
    ),
});

const createBundlesClient = (transport: CanopyV0Transport): CanopyV0ServiceHandlers['bundles'] => ({
  listBundles: (request: CanopyV0ListBundlesRequest) =>
    callRoute<CanopyV0ListBundlesRequest, CanopyV0ListBundlesResponse>(
      transport,
      'Bundles.listBundles',
      request,
    ),
  installBundle: (request: CanopyV0InstallBundleRequest) =>
    callRoute<CanopyV0InstallBundleRequest, CanopyV0InstallBundleResponse>(
      transport,
      'Bundles.installBundle',
      request,
    ),
  getSchema: (request: CanopyV0GetSchemaRequest) =>
    callRoute<CanopyV0GetSchemaRequest, CanopyV0GraphSchemaResponse>(
      transport,
      'Bundles.getSchema',
      request,
    ),
  registerShapeMigration: (request: CanopyV0RegisterShapeMigrationRequest) =>
    callRoute<CanopyV0RegisterShapeMigrationRequest, CanopyV0ShapeMigrationRecord>(
      transport,
      'Bundles.registerShapeMigration',
      request,
    ),
});

const createStreamsClient = (transport: CanopyV0Transport): CanopyV0ServiceHandlers['streams'] => ({
  subscribeEvents: (request: CanopyV0StreamSubscribeRequest) =>
    callRoute<CanopyV0StreamSubscribeRequest, CanopyV0StreamReplayResponse>(
      transport,
      'Streams.subscribeEvents',
      request,
    ),
  replayEvents: (request: CanopyV0StreamReplayRequest) =>
    callRoute<CanopyV0StreamReplayRequest, CanopyV0StreamReplayResponse>(
      transport,
      'Streams.replayEvents',
      request,
    ),
});

export const createCanopyV0Client = (transport: CanopyV0Transport): CanopyV0Client => ({
  graphs: createGraphsClient(transport),
  transactions: createTransactionsClient(transport),
  queries: createQueriesClient(transport),
  views: createViewsClient(transport),
  bundles: createBundlesClient(transport),
  streams: createStreamsClient(transport),
});
