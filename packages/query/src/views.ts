import type { Graph, Node, NodeId, PropertyValue, ScalarValue, Result } from '@canopy/types';
import { createNodeId, createInstant, ok, err, fromThrowable } from '@canopy/types';
import { SYSTEM_IDS, addNode } from '@canopy/core';
import type { Query, Sort } from './model';
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
function scalar(val: string | number | boolean): Result<ScalarValue, Error> {
  if (typeof val === 'string') return ok({ kind: 'text', value: val });
  if (typeof val === 'number') return ok({ kind: 'number', value: val });
  if (typeof val === 'boolean') return ok({ kind: 'boolean', value: val });
  return err(new Error(`Unsupported scalar type: ${typeof val}`));
}

// Helper to create a reference value
function reference(target: NodeId): PropertyValue {
  return { kind: 'reference', target };
}

// Helper to create a list property
function list(items: readonly string[]): PropertyValue {
  return { kind: 'list', items: items.map((i) => ({ kind: 'text', value: i })) };
}

export function saveViewDefinition(
  graph: Graph,
  view: ViewDefinition,
): Result<{ graph: Graph; nodeId: NodeId }, Error> {
  const nodeId = createNodeId();

  const nameVal = scalar(view.name);
  if (!nameVal.ok) return err(nameVal.error);

  const layoutVal = scalar(view.layout);
  if (!layoutVal.ok) return err(layoutVal.error);

  const descriptionVal = view.description ? scalar(view.description) : ok(undefined);
  if (!descriptionVal.ok) return err(descriptionVal.error);

  const sortVal =
    view.sort && view.sort.length > 0 ? scalar(JSON.stringify(view.sort)) : ok(undefined);
  if (!sortVal.ok) return err(sortVal.error);

  const groupByVal = view.groupBy ? scalar(view.groupBy) : ok(undefined);
  if (!groupByVal.ok) return err(groupByVal.error);

  const pageSizeVal = view.pageSize ? scalar(view.pageSize) : ok(undefined);
  if (!pageSizeVal.ok) return err(pageSizeVal.error);

  const properties = new Map([
    ['name', nameVal.value],
    ['queryRef', reference(view.queryRef)],
    ['layout', layoutVal.value],
    ...(descriptionVal.value ? [['description', descriptionVal.value] as const] : []),
    ...(sortVal.value ? [['sort', sortVal.value] as const] : []),
    ...(groupByVal.value ? [['groupBy', groupByVal.value] as const] : []),
    ...(view.displayProperties && view.displayProperties.length > 0
      ? [['displayProperties', list(view.displayProperties)] as const]
      : []),
    ...(pageSizeVal.value ? [['pageSize', pageSizeVal.value] as const] : []),
  ]);

  const node: Node = {
    id: nodeId,
    type: SYSTEM_IDS.VIEW_DEFINITION,
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

export function getViewDefinition(graph: Graph, nodeId: NodeId): Result<ViewDefinition, Error> {
  const node = graph.nodes.get(nodeId);
  if (!node) {
    return err(new Error(`View definition node ${nodeId} not found`));
  }

  if (node.type !== SYSTEM_IDS.VIEW_DEFINITION) {
    return err(new Error(`Node ${nodeId} is not a View Definition`));
  }

  const nameProp = node.properties.get('name');
  if (!nameProp || nameProp.kind !== 'text') return err(new Error('Invalid view name'));

  const queryRefProp = node.properties.get('queryRef');
  if (!queryRefProp || queryRefProp.kind !== 'reference')
    return err(new Error('Invalid view queryRef'));

  const layoutProp = node.properties.get('layout');
  if (!layoutProp || layoutProp.kind !== 'text') return err(new Error('Invalid view layout'));

  const description = node.properties.get('description');
  const sortProp = node.properties.get('sort');
  const groupBy = node.properties.get('groupBy');
  const displayProperties = node.properties.get('displayProperties');
  const pageSize = node.properties.get('pageSize');

  const sort: readonly Sort[] | undefined = (() => {
    if (sortProp && sortProp.kind === 'text') {
      const parsed = fromThrowable(() => JSON.parse(sortProp.value) as readonly Sort[]);
      if (parsed.ok) return parsed.value;
    }
    return;
  })();

  const displayPropertiesList =
    displayProperties && displayProperties.kind === 'list'
      ? displayProperties.items
          .filter((i) => i.kind === 'text')
          .map((i) => (i.kind === 'text' ? i.value : '')) // Explicit check to satisfy types, though filter handles it
          .filter((s) => s !== '')
      : undefined;

  return ok({
    name: nameProp.value,
    queryRef: queryRefProp.target,
    layout: layoutProp.value,
    ...(description && description.kind === 'text' ? { description: description.value } : {}),
    ...(sort ? { sort } : {}),
    ...(groupBy && groupBy.kind === 'text' ? { groupBy: groupBy.value } : {}),
    ...(displayPropertiesList ? { displayProperties: displayPropertiesList } : {}),
    ...(pageSize && pageSize.kind === 'number' ? { pageSize: pageSize.value } : {}),
  });
}

export function listViewDefinitions(graph: Graph): readonly Node[] {
  return [...graph.nodes.values()].filter((node) => node.type === SYSTEM_IDS.VIEW_DEFINITION);
}

export function resolveView(graph: Graph, viewNodeId: NodeId): Result<ResolvedView, Error> {
  const viewDef = getViewDefinition(graph, viewNodeId);
  if (!viewDef.ok) return err(viewDef.error);

  const queryDef = getQueryDefinition(graph, viewDef.value.queryRef);
  if (!queryDef.ok) return err(queryDef.error);

  return ok({
    definition: viewDef.value,
    query: queryDef.value,
  });
}
