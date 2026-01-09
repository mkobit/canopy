import {
  Graph,
  Node,
  NodeId,
  createNodeId,
  createInstant,
  PropertyValue,
  ScalarValue,
} from '@canopy/types';
import { SYSTEM_IDS, addNode } from '@canopy/core';
import { Query, Sort } from './model';
import { getQueryDefinition } from './stored';

export interface ViewDefinition {
  readonly name: string;
  readonly description?: string;
  readonly queryRef: NodeId;
  readonly layout: string;
  readonly sort?: readonly Sort[];
  readonly groupBy?: string;
  readonly displayProperties?: readonly string[];
  readonly pageSize?: number;
}

export interface ResolvedView {
  readonly definition: ViewDefinition;
  readonly query: Query;
}

// Helper to wrap a scalar value
function scalar(val: string | number | boolean): ScalarValue {
  if (typeof val === 'string') return { kind: 'text', value: val };
  if (typeof val === 'number') return { kind: 'number', value: val };
  if (typeof val === 'boolean') return { kind: 'boolean', value: val };
  throw new Error(`Unsupported scalar type: ${typeof val}`);
}

// Helper to create a reference value
function reference(target: NodeId): PropertyValue {
  return { kind: 'reference', target };
}

// Helper to create a list property
function list(items: readonly string[]): PropertyValue {
  return { kind: 'list', items: items.map(i => ({ kind: 'text', value: i })) };
}

export function saveViewDefinition(
  graph: Graph,
  view: ViewDefinition
): { readonly graph: Graph; readonly nodeId: NodeId } {
  const nodeId = createNodeId();

  const baseProperties: readonly (readonly [string, PropertyValue])[] = [
    ['name', scalar(view.name)],
    ['queryRef', reference(view.queryRef)],
    ['layout', scalar(view.layout)],
    ...(view.description ? [['description', scalar(view.description)] as const] : []),
    ...(view.sort && view.sort.length > 0 ? [['sort', scalar(JSON.stringify(view.sort))] as const] : []),
    ...(view.groupBy ? [['groupBy', scalar(view.groupBy)] as const] : []),
    ...(view.displayProperties && view.displayProperties.length > 0 ? [['displayProperties', list(view.displayProperties)] as const] : []),
    ...(view.pageSize ? [['pageSize', scalar(view.pageSize)] as const] : []),
  ];

  const properties = new Map(baseProperties);

  const node: Node = {
    id: nodeId,
    type: SYSTEM_IDS.VIEW_DEFINITION,
    properties,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
    },
  };

  const newGraph = addNode(graph, node);
  return { graph: newGraph, nodeId };
}

export function getViewDefinition(graph: Graph, nodeId: NodeId): ViewDefinition {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    throw new Error(`View definition node ${nodeId} not found`);
  }

  if (node.type !== SYSTEM_IDS.VIEW_DEFINITION) {
    throw new Error(`Node ${nodeId} is not a View Definition`);
  }

  const nameProp = node.properties.get('name');
  if (!nameProp || nameProp.kind !== 'text') throw new Error('Invalid view name');

  const queryRefProp = node.properties.get('queryRef');
  if (!queryRefProp || queryRefProp.kind !== 'reference') throw new Error('Invalid view queryRef');

  const layoutProp = node.properties.get('layout');
  if (!layoutProp || layoutProp.kind !== 'text') throw new Error('Invalid view layout');

  const description = node.properties.get('description');
  const sortProp = node.properties.get('sort');
  const groupBy = node.properties.get('groupBy');
  const displayProperties = node.properties.get('displayProperties');
  const pageSize = node.properties.get('pageSize');

  const sort: readonly Sort[] | undefined = (() => {
    if (sortProp && sortProp.kind === 'text') {
      try {
        return JSON.parse(sortProp.value) as readonly Sort[];
      } catch (e) {
        // Ignore invalid JSON sort
      }
    }
    return undefined;
  })();

  const displayPropertiesList = (displayProperties && displayProperties.kind === 'list')
      ? displayProperties.items
          .filter(i => i.kind === 'text')
          .map(i => i.kind === 'text' ? i.value : '') // Explicit check to satisfy types, though filter handles it
          .filter(s => s !== '')
      : undefined;

  return {
    name: nameProp.value,
    queryRef: queryRefProp.target,
    layout: layoutProp.value,
    ...(description && description.kind === 'text' ? { description: description.value } : {}),
    ...(sort ? { sort } : {}),
    ...(groupBy && groupBy.kind === 'text' ? { groupBy: groupBy.value } : {}),
    ...(displayPropertiesList ? { displayProperties: displayPropertiesList } : {}),
    ...(pageSize && pageSize.kind === 'number' ? { pageSize: pageSize.value } : {}),
  };
}

export function listViewDefinitions(graph: Graph): readonly Node[] {
  return Array.from(graph.nodes.values()).filter(
    (node) => node.type === SYSTEM_IDS.VIEW_DEFINITION
  );
}

export function resolveView(graph: Graph, viewNodeId: NodeId): ResolvedView {
  const viewDef = getViewDefinition(graph, viewNodeId);
  const queryDef = getQueryDefinition(graph, viewDef.queryRef);
  return {
    definition: viewDef,
    query: queryDef
  };
}
