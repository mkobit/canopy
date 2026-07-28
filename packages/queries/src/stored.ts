import type {
  Graph,
  Node,
  NodeId,
  QueryResult,
  PropertyValue,
  ScalarValue,
  Result,
  DeviceId,
} from '@canopy/graph';
import {
  createNodeId,
  createInstant,
  ok,
  err,
  fromThrowable,
  asDeviceId,
  SYSTEM_IDS,
  addNode,
} from '@canopy/graph';
import type { Query } from './model';
import { executeQuery } from './engine';
import { mapValues, isPlainObject, isString } from 'remeda';

const scalar: (value: string | number | boolean) => Result<ScalarValue, Error> = ok;

// Helper to create a list property
function list(items: readonly string[]): PropertyValue {
  return items;
}

export interface SaveQueryOptions {
  readonly description?: string;
  readonly nodeTypes?: readonly string[];
  readonly parameters?: readonly string[];
  readonly deviceId: DeviceId;
}

export function saveQueryDefinition(
  graph: Graph,
  name: string,
  query: Query,
  options: SaveQueryOptions,
): Result<{ graph: Graph; nodeId: NodeId }, Error> {
  const nodeId = createNodeId();

  const nameValue = scalar(name);
  if (!nameValue.ok) return err(nameValue.error);

  const definitionValue = scalar(JSON.stringify(query));
  if (!definitionValue.ok) return err(definitionValue.error);

  const baseProperties: readonly (readonly [string, PropertyValue])[] = [
    ['name', nameValue.value],
    ['definition', definitionValue.value],
  ];

  const descValue = options.description ? scalar(options.description) : undefined;
  if (descValue && !descValue.ok) return err(descValue.error);

  const descriptionProperty: readonly (readonly [string, PropertyValue])[] = descValue
    ? [['description', descValue.value]]
    : [];

  const nodeTypesProperty: readonly (readonly [string, PropertyValue])[] =
    options.nodeTypes && options.nodeTypes.length > 0
      ? [['nodeTypes', list(options.nodeTypes)]]
      : [];

  const parametersProperty: readonly (readonly [string, PropertyValue])[] =
    options.parameters && options.parameters.length > 0
      ? [['parameters', list(options.parameters)]]
      : [];

  const properties = new Map([
    ...baseProperties,
    ...descriptionProperty,
    ...nodeTypesProperty,
    ...parametersProperty,
  ]);

  const node: Node = {
    id: nodeId,
    type: SYSTEM_IDS.QUERY_DEFINITION,
    properties,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
  };

  const newGraphResult = addNode(graph, node, {
    deviceId: options.deviceId,
  });
  if (!newGraphResult.ok) return err(newGraphResult.error);

  return ok({ graph: newGraphResult.value.graph, nodeId });
}

export function getQueryDefinition(graph: Graph, nodeId: NodeId): Result<Query, Error> {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    return err(new Error(`Query definition node ${nodeId} not found`));
  }

  if (node.type !== SYSTEM_IDS.QUERY_DEFINITION) {
    return err(new Error(`Node ${nodeId} is not a Query Definition`));
  }

  const definitionProperty = node.properties.get('definition');
  if (typeof definitionProperty !== 'string') {
    return err(new Error(`Query definition node ${nodeId} has invalid definition property`));
  }

  return fromThrowable(
    () => {
      return JSON.parse(definitionProperty) as Query;
    },
    (error) => new Error(`Failed to parse query definition for node ${nodeId}: ${error}`),
  );
}

export function listQueryDefinitions(graph: Graph): readonly Node[] {
  return [...graph.nodes.values()].filter((node) => node.type === SYSTEM_IDS.QUERY_DEFINITION);
}

// Helper to substitute parameters in the query structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function substituteParameters(object: any, parameters: Record<string, unknown>): any {
  if (Array.isArray(object)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return object.map((item: any) => substituteParameters(item, parameters));
  }
  if (isPlainObject(object)) {
    return mapValues(object, (value) => {
      if (isString(value) && value.startsWith('$')) {
        const parameterName = value.slice(1);
        if (Object.hasOwn(parameters, parameterName)) {
          return parameters[parameterName];
        }
      }
      return substituteParameters(value, parameters);
    });
  }
  return object;
}

export function executeStoredQuery(
  graph: Graph,
  queryNodeId: NodeId,
  parameters: Record<string, unknown> = {},
): Result<QueryResult, Error> {
  const queryResult = getQueryDefinition(graph, queryNodeId);
  if (!queryResult.ok) return err(queryResult.error);

  const query = queryResult.value;
  const substitutedQuery = substituteParameters(query, parameters) as Query;
  return executeQuery(graph, substitutedQuery);
}
