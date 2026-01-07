import {
  Graph,
  Node,
  NodeId,
  QueryResult,
  createNodeId,
  createInstant,
  PropertyValue,
  ScalarValue
} from '@canopy/types';
import { SYSTEM_IDS, addNode } from '@canopy/core';
import { Query } from './model';
import { QueryEngine } from './engine';
import { mapValues, isPlainObject, isString } from 'remeda';

// Helper to wrap a scalar value
function scalar(val: string | number | boolean): ScalarValue {
  if (typeof val === 'string') return { kind: 'text', value: val };
  if (typeof val === 'number') return { kind: 'number', value: val };
  if (typeof val === 'boolean') return { kind: 'boolean', value: val };
  throw new Error(`Unsupported scalar type: ${typeof val}`);
}

// Helper to create a list property
function list(items: string[]): PropertyValue {
  return { kind: 'list', items: items.map(i => ({ kind: 'text', value: i })) };
}

export interface SaveQueryOptions {
  description?: string;
  nodeTypes?: string[];
  parameters?: string[];
}

export function saveQueryDefinition(
  graph: Graph,
  name: string,
  query: Query,
  options: SaveQueryOptions = {}
): { graph: Graph; nodeId: NodeId } {
  const nodeId = createNodeId();

  const baseProperties: [string, PropertyValue][] = [
    ['name', scalar(name)],
    ['definition', scalar(JSON.stringify(query))],
  ];

  const descriptionProp: [string, PropertyValue][] = options.description
    ? [['description', scalar(options.description)]]
    : [];

  const nodeTypesProp: [string, PropertyValue][] = options.nodeTypes && options.nodeTypes.length > 0
    ? [['nodeTypes', list(options.nodeTypes)]]
    : [];

  const parametersProp: [string, PropertyValue][] = options.parameters && options.parameters.length > 0
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

  const newGraph = addNode(graph, node);
  return { graph: newGraph, nodeId };
}

export function getQueryDefinition(graph: Graph, nodeId: NodeId): Query {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    throw new Error(`Query definition node ${nodeId} not found`);
  }

  if (node.type !== SYSTEM_IDS.QUERY_DEFINITION) {
    throw new Error(`Node ${nodeId} is not a Query Definition`);
  }

  const definitionProp = node.properties.get('definition');
  if (!definitionProp || definitionProp.kind !== 'text') {
    throw new Error(`Query definition node ${nodeId} has invalid definition property`);
  }

  try {
    return JSON.parse(definitionProp.value) as Query;
  } catch (e) {
    throw new Error(`Failed to parse query definition for node ${nodeId}: ${e}`);
  }
}

export function listQueryDefinitions(graph: Graph): Node[] {
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
): QueryResult {
  const query = getQueryDefinition(graph, queryNodeId);
  const substitutedQuery = substituteParams(query, params) as Query;
  return engine.execute(substitutedQuery);
}
