import {
  Graph,
  Node,
  NodeId,
  QueryResult,
  createNodeId,
  createInstant,
  PropertyValue,
  ScalarValue,
  Result,
  ok,
  err,
  fromThrowable
} from '@canopy/types';
import { SYSTEM_IDS, addNode } from '@canopy/core';
import { Query } from './model';
import { QueryEngine } from './engine';
import { mapValues, isPlainObject, isString } from 'remeda';

// Helper to wrap a scalar value
function scalar(val: string | number | boolean): Result<ScalarValue, Error> {
  if (typeof val === 'string') return ok({ kind: 'text', value: val });
  if (typeof val === 'number') return ok({ kind: 'number', value: val });
  if (typeof val === 'boolean') return ok({ kind: 'boolean', value: val });
  return err(new Error(`Unsupported scalar type: ${typeof val}`));
}

// Helper to create a list property
function list(items: readonly string[]): PropertyValue {
  return { kind: 'list', items: items.map(i => ({ kind: 'text', value: i })) };
}

export interface SaveQueryOptions {
  readonly description?: string;
  readonly nodeTypes?: readonly string[];
  readonly parameters?: readonly string[];
}

export function saveQueryDefinition(
  graph: Graph,
  name: string,
  query: Query,
  options: SaveQueryOptions = {}
): Result<{ graph: Graph; nodeId: NodeId }, Error> {
  const nodeId = createNodeId();

  const nameVal = scalar(name);
  if (!nameVal.ok) return err(nameVal.error);

  const defVal = scalar(JSON.stringify(query));
  if (!defVal.ok) return err(defVal.error);

  const baseProperties: (readonly [string, PropertyValue])[] = [
    ['name', nameVal.value],
    ['definition', defVal.value],
  ];

  // eslint-disable-next-line functional/no-let
  let descriptionProp: readonly (readonly [string, PropertyValue])[] = [];
  if (options.description) {
      const descVal = scalar(options.description);
      if (!descVal.ok) return err(descVal.error);
      descriptionProp = [['description', descVal.value]];
  }

  const nodeTypesProp: readonly (readonly [string, PropertyValue])[] = options.nodeTypes && options.nodeTypes.length > 0
    ? [['nodeTypes', list(options.nodeTypes)]]
    : [];

  const parametersProp: readonly (readonly [string, PropertyValue])[] = options.parameters && options.parameters.length > 0
    ? [['parameters', list(options.parameters)]]
    : [];

  const properties = new Map([
    ...baseProperties,
    ...descriptionProp,
    ...nodeTypesProp,
    ...parametersProp
  ]);

  const node: Node = {
    id: nodeId,
    type: SYSTEM_IDS.QUERY_DEFINITION,
    properties,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
    },
  };

  const newGraphResult = addNode(graph, node);
  if (!newGraphResult.ok) return err(newGraphResult.error);

  return ok({ graph: newGraphResult.value, nodeId });
}

export function getQueryDefinition(graph: Graph, nodeId: NodeId): Result<Query, Error> {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    return err(new Error(`Query definition node ${nodeId} not found`));
  }

  if (node.type !== SYSTEM_IDS.QUERY_DEFINITION) {
    return err(new Error(`Node ${nodeId} is not a Query Definition`));
  }

  const definitionProp = node.properties.get('definition');
  if (!definitionProp || definitionProp.kind !== 'text') {
    return err(new Error(`Query definition node ${nodeId} has invalid definition property`));
  }

  return fromThrowable(() => {
    return JSON.parse(definitionProp.value) as Query;
  }, (e) => new Error(`Failed to parse query definition for node ${nodeId}: ${e}`));
}

export function listQueryDefinitions(graph: Graph): readonly Node[] {
  return Array.from(graph.nodes.values()).filter(
    (node) => node.type === SYSTEM_IDS.QUERY_DEFINITION
  );
}

// Helper to substitute parameters in the query structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function substituteParams(obj: any, params: Record<string, unknown>): any {
  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return obj.map((item: any) => substituteParams(item, params));
  } else if (isPlainObject(obj)) {
    return mapValues(obj, (value) => {
      if (isString(value) && value.startsWith('$')) {
        const paramName = value.substring(1);
        if (paramName in params) {
          return params[paramName];
        }
      }
      return substituteParams(value, params);
    });
  }
  return obj;
}

export function executeStoredQuery(
  engine: QueryEngine,
  graph: Graph,
  queryNodeId: NodeId,
  params: Record<string, unknown> = {}
): Result<QueryResult, Error> {
  const queryResult = getQueryDefinition(graph, queryNodeId);
  if (!queryResult.ok) return err(queryResult.error);

  const query = queryResult.value;
  const substitutedQuery = substituteParams(query, params) as Query;
  return engine.execute(substitutedQuery);
}
