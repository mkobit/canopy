import type {
  Graph,
  Node,
  NodeId,
  PropertyValue,
  ScalarValue,
  Result,
  DeviceId,
} from '@canopy/graph';
import { executeQuery } from './engine';
import {
  createNodeId,
  createInstant,
  ok,
  err,
  fromThrowable,
  asNodeId,
  SYSTEM_IDS,
  addNode,
  SYSTEM_DEVICE_ID,
} from '@canopy/graph';
import type { Query, Sort } from './model';
import { getQueryDefinition } from './stored';

export interface ViewDefinition {
  readonly name: string;
  readonly description?: string;
  readonly queryRef?: NodeId;
  readonly layout: string;
  readonly sort?: readonly Sort[];
  readonly groupBy?: string;
  readonly displayProperties?: readonly string[];
  readonly pageSize?: number;
}

export type SaveViewOptions = Readonly<{
  deviceId: DeviceId;
  batchId?: string;
  migrationId?: string;
}>;

export interface ResolvedView {
  readonly definition: ViewDefinition;
  readonly query: Query;
}

// Helper to return a scalar value directly
function scalar(val: string | number | boolean): ScalarValue {
  return val;
}

// Helper to create a reference value
function reference(target: NodeId): PropertyValue {
  return target;
}

// Helper to create a list property
function list(items: readonly string[]): PropertyValue {
  return items;
}

export function saveViewDefinition(
  graph: Graph,
  view: ViewDefinition,
  options: SaveViewOptions,
): Result<{ graph: Graph; nodeId: NodeId }, Error> {
  const nodeId = createNodeId();

  const nameVal = scalar(view.name);
  const layoutVal = scalar(view.layout);
  const descriptionVal = view.description ? scalar(view.description) : undefined;
  const sortVal = view.sort && view.sort.length > 0 ? scalar(JSON.stringify(view.sort)) : undefined;
  const groupByVal = view.groupBy ? scalar(view.groupBy) : undefined;
  const pageSizeVal = view.pageSize ? scalar(view.pageSize) : undefined;

  const properties = new Map<string, PropertyValue>([
    ['name', nameVal],
    ['layout', layoutVal],
    ...(view.queryRef ? [['queryRef', reference(view.queryRef)] as const] : []),
    ...(descriptionVal === undefined ? [] : [['description', descriptionVal] as const]),
    ...(sortVal === undefined ? [] : [['sort', sortVal] as const]),
    ...(groupByVal === undefined ? [] : [['groupBy', groupByVal] as const]),
    ...(view.displayProperties && view.displayProperties.length > 0
      ? [['displayProperties', list(view.displayProperties)] as const]
      : []),
    ...(pageSizeVal === undefined ? [] : [['pageSize', pageSizeVal] as const]),
  ]);

  const node: Node = {
    id: nodeId,
    type: SYSTEM_IDS.VIEW_DEFINITION,
    properties,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
  };

  const newGraphResult = addNode(graph, node, {
    deviceId: options.deviceId,
    ...(options.batchId !== undefined && { batchId: options.batchId }),
    ...(options.migrationId !== undefined && { migrationId: options.migrationId }),
  });
  if (!newGraphResult.ok) return err(newGraphResult.error);

  return ok({ graph: newGraphResult.value.graph, nodeId });
}

export function getViewDefinition(graph: Graph, nodeId: NodeId): Result<ViewDefinition, Error> {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    return err(new Error(`View definition node ${nodeId} not found`));
  }

  if (node.type !== SYSTEM_IDS.VIEW_DEFINITION) {
    return err(new Error(`Node ${nodeId} is not a View Definition`));
  }

  const nameProp = node.properties.get('name');
  if (typeof nameProp !== 'string') return err(new Error('Invalid view name'));

  const queryRefProp = node.properties.get('queryRef');
  if (queryRefProp !== undefined && typeof queryRefProp !== 'string') {
    return err(new Error('Invalid view queryRef'));
  }

  const layoutProp = node.properties.get('layout');
  if (typeof layoutProp !== 'string') return err(new Error('Invalid view layout'));

  const description = node.properties.get('description');
  const sortProp = node.properties.get('sort');
  const groupBy = node.properties.get('groupBy');
  const displayProperties = node.properties.get('displayProperties');
  const pageSize = node.properties.get('pageSize');

  const sort: readonly Sort[] | undefined = (() => {
    if (typeof sortProp === 'string') {
      const parsed = fromThrowable(() => JSON.parse(sortProp) as readonly Sort[]);
      if (parsed.ok) return parsed.value;
    }
    return;
  })();

  const displayPropertiesList = Array.isArray(displayProperties)
    ? displayProperties
        .filter((i) => typeof i === 'string')
        .map((i) => i as string)
        .filter((s) => s !== '')
    : undefined;

  return ok({
    name: nameProp,
    layout: layoutProp,
    ...(queryRefProp !== undefined && { queryRef: asNodeId(queryRefProp) }),
    ...(typeof description === 'string' && { description: description }),
    ...(sort && { sort }),
    ...(typeof groupBy === 'string' && { groupBy: groupBy }),
    ...(displayPropertiesList && { displayProperties: displayPropertiesList }),
    ...(typeof pageSize === 'number' && { pageSize: pageSize }),
  });
}

export function listViewDefinitions(graph: Graph): readonly Node[] {
  return [...graph.nodes.values()].filter((node) => node.type === SYSTEM_IDS.VIEW_DEFINITION);
}

const SYSTEM_ID_PREFIXES = [
  'node:type:',
  'edge:type:',
  'meta:',
  'query:system:',
  'view:system:',
  'system:',
  'namespace:',
] as const;

export function isSystemNode(node: Node): boolean {
  return SYSTEM_ID_PREFIXES.some((prefix) => node.id.startsWith(prefix));
}

export function executeView(
  graph: Graph,
  viewNodeId: NodeId,
): Result<Readonly<{ definition: ViewDefinition; nodes: readonly Node[] }>, Error> {
  const resolved = resolveView(graph, viewNodeId);
  if (!resolved.ok) return err(resolved.error);

  const queryResult = executeQuery(graph, resolved.value.query);
  if (!queryResult.ok) return err(queryResult.error);

  const nodes = queryResult.value.nodes.filter((node) => !isSystemNode(node));
  return ok({ definition: resolved.value.definition, nodes });
}

export function resolveView(graph: Graph, viewNodeId: NodeId): Result<ResolvedView, Error> {
  const viewDef = getViewDefinition(graph, viewNodeId);
  if (!viewDef.ok) return err(viewDef.error);

  if (!viewDef.value.queryRef) {
    return err(new Error(`View definition ${viewNodeId} does not have a queryRef`));
  }

  const queryDef = getQueryDefinition(graph, viewDef.value.queryRef);
  if (!queryDef.ok) return err(queryDef.error);

  return ok({
    definition: viewDef.value,
    query: queryDef.value,
  });
}
