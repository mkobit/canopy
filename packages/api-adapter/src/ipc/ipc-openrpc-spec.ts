/* eslint-disable unicorn/name-replacements -- Params* names match IPC schema definitions */
import { z } from 'zod';
import {
  IPC_METHODS,
  JSON_RPC_ERROR_CODES,
  HandshakeParamsSchema,
  HandshakeResultSchema,
  GetNodeParamsSchema,
  GetNodesParamsSchema,
  GetEdgeParamsSchema,
  GetEdgesParamsSchema,
  ExecuteQueryParamsSchema,
  CreateNodeParamsSchema,
  UpdateNodePropertiesParamsSchema,
  DeleteNodeParamsSchema,
  CreateEdgeParamsSchema,
  DeleteEdgeParamsSchema,
  SubscribeParamsSchema,
  SubscribeResultSchema,
  UnsubscribeParamsSchema,
  UnsubscribeResultSchema,
  EventNotificationParamsSchema,
} from './ipc-schema';

const sortKeysRecursively = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysRecursively);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    const sortedKeys = Object.keys(record).toSorted((a, b) => a.localeCompare(b));
    return Object.fromEntries(sortedKeys.map((key) => [key, sortKeysRecursively(record[key])]));
  }
  return value;
};

const methodSchemas = [
  { name: IPC_METHODS.HANDSHAKE, params: HandshakeParamsSchema, result: HandshakeResultSchema },
  { name: IPC_METHODS.QUERY_GET_NODE, params: GetNodeParamsSchema },
  { name: IPC_METHODS.QUERY_GET_NODES, params: GetNodesParamsSchema },
  { name: IPC_METHODS.QUERY_GET_EDGE, params: GetEdgeParamsSchema },
  { name: IPC_METHODS.QUERY_GET_EDGES, params: GetEdgesParamsSchema },
  { name: IPC_METHODS.QUERY_EXECUTE_QUERY, params: ExecuteQueryParamsSchema },
  { name: IPC_METHODS.MUTATION_CREATE_NODE, params: CreateNodeParamsSchema },
  { name: IPC_METHODS.MUTATION_UPDATE_NODE_PROPERTIES, params: UpdateNodePropertiesParamsSchema },
  { name: IPC_METHODS.MUTATION_DELETE_NODE, params: DeleteNodeParamsSchema },
  { name: IPC_METHODS.MUTATION_CREATE_EDGE, params: CreateEdgeParamsSchema },
  { name: IPC_METHODS.MUTATION_DELETE_EDGE, params: DeleteEdgeParamsSchema },
  {
    name: IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
    params: SubscribeParamsSchema,
    result: SubscribeResultSchema,
  },
  {
    name: IPC_METHODS.EVENT_STREAM_UNSUBSCRIBE,
    params: UnsubscribeParamsSchema,
    result: UnsubscribeResultSchema,
  },
  { name: IPC_METHODS.EVENT_STREAM_EVENT, params: EventNotificationParamsSchema },
] as const;

const openRpcObject = {
  openrpc: '1.3.2',
  info: {
    title: 'Canopy IPC Protocol Specification',
    version: '0.1.0',
  },
  methods: methodSchemas.map((m) => {
    const jsonSchema = z.toJSONSchema(m.params) as Readonly<{
      properties?: Readonly<Record<string, unknown>>;
      required?: readonly string[];
    }>;
    const properties = jsonSchema.properties ?? {};
    const requiredList = jsonSchema.required ?? [];

    return {
      name: m.name,
      paramStructure: 'by-name',
      params: Object.entries(properties).map(([paramName, schema]) => ({
        name: paramName,
        required: requiredList.includes(paramName),
        schema,
      })),
      ...('result' in m &&
        m.result && { result: { name: 'result', schema: z.toJSONSchema(m.result) } }),
    };
  }),
  errors: Object.entries(JSON_RPC_ERROR_CODES).map(([key, code]) => ({
    code,
    message: key,
  })),
};

export const JSON_RPC_IPC_SPECIFICATION: string =
  JSON.stringify(sortKeysRecursively(openRpcObject), null, 2) + '\n';
