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
  name: string;
  description?: string;
  queryRef: NodeId;
  layout: string;
  sort?: Sort[];
  groupBy?: string;
  displayProperties?: string[];
  pageSize?: number;
}

export interface ResolvedView {
  definition: ViewDefinition;
  query: Query;
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
function list(items: string[]): PropertyValue {
  return { kind: 'list', items: items.map(i => ({ kind: 'text', value: i })) };
}

export function saveViewDefinition(
  graph: Graph,
  view: ViewDefinition
): { graph: Graph; nodeId: NodeId } {
  const nodeId = createNodeId();

  const baseProperties: [string, PropertyValue][] = [
    ['name', scalar(view.name)],
    ['queryRef', reference(view.queryRef)],
    ['layout', scalar(view.layout)]
  ];

  if (view.description) {
    baseProperties.push(['description', scalar(view.description)]);
  }
  if (view.sort && view.sort.length > 0) {
    baseProperties.push(['sort', scalar(JSON.stringify(view.sort))]);
  }
  if (view.groupBy) {
    baseProperties.push(['groupBy', scalar(view.groupBy)]);
  }
  if (view.displayProperties && view.displayProperties.length > 0) {
    baseProperties.push(['displayProperties', list(view.displayProperties)]);
  }
  if (view.pageSize) {
    baseProperties.push(['pageSize', scalar(view.pageSize)]);
  }

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

  const view: ViewDefinition = {
    name: nameProp.value,
    queryRef: queryRefProp.target,
    layout: layoutProp.value
  };

  const description = node.properties.get('description');
  if (description && description.kind === 'text') view.description = description.value;

  const sortProp = node.properties.get('sort');
  if (sortProp && sortProp.kind === 'text') {
    try {
      view.sort = JSON.parse(sortProp.value) as Sort[];
    } catch (e) {
      // Ignore invalid JSON sort
    }
  }

  const groupBy = node.properties.get('groupBy');
  if (groupBy && groupBy.kind === 'text') view.groupBy = groupBy.value;

  const displayProperties = node.properties.get('displayProperties');
  if (displayProperties && displayProperties.kind === 'list') {
    view.displayProperties = displayProperties.items
      .filter(i => i.kind === 'text')
      .map(i => (i as any).value);
  }

  const pageSize = node.properties.get('pageSize');
  if (pageSize && pageSize.kind === 'number') view.pageSize = pageSize.value;

  return view;
}

export function listViewDefinitions(graph: Graph): Node[] {
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
