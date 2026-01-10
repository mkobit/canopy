import {
  Graph,
  Node,
  NodeId,
  createNodeId,
  createInstant,
  PropertyValue,
  ScalarValue,
  Result,
  ok,
  err
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
  return { kind: 'list', items: items.map(i => ({ kind: 'text', value: i })) };
}

export function saveViewDefinition(
  graph: Graph,
  view: ViewDefinition
): Result<{ graph: Graph; nodeId: NodeId }, Error> {
  const nodeId = createNodeId();

  // We need to unwrap or check scalars. Since these come from ViewDefinition which is typed,
  // we can expect them to work, but strict checking requires it.
  const nameVal = scalar(view.name);
  if (!nameVal.ok) return err(nameVal.error);

  const layoutVal = scalar(view.layout);
  if (!layoutVal.ok) return err(layoutVal.error);

  // eslint-disable-next-line functional/prefer-readonly-type
  const baseProperties: [string, PropertyValue][] = [
    ['name', nameVal.value],
    ['queryRef', reference(view.queryRef)],
    ['layout', layoutVal.value],
  ];

  if (view.description) {
      const v = scalar(view.description);
      if (!v.ok) return err(v.error);
      // eslint-disable-next-line functional/immutable-data
      baseProperties.push(['description', v.value]);
  }
  if (view.sort && view.sort.length > 0) {
      const v = scalar(JSON.stringify(view.sort));
      if (!v.ok) return err(v.error);
      // eslint-disable-next-line functional/immutable-data
      baseProperties.push(['sort', v.value]);
  }
  if (view.groupBy) {
      const v = scalar(view.groupBy);
      if (!v.ok) return err(v.error);
      // eslint-disable-next-line functional/immutable-data
      baseProperties.push(['groupBy', v.value]);
  }
  if (view.displayProperties && view.displayProperties.length > 0) {
      // eslint-disable-next-line functional/immutable-data
      baseProperties.push(['displayProperties', list(view.displayProperties)]);
  }
  if (view.pageSize) {
      const v = scalar(view.pageSize);
      if (!v.ok) return err(v.error);
      // eslint-disable-next-line functional/immutable-data
      baseProperties.push(['pageSize', v.value]);
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
  if (!newGraph.ok) return err(newGraph.error);

  return ok({ graph: newGraph.value, nodeId });
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
  if (!queryRefProp || queryRefProp.kind !== 'reference') return err(new Error('Invalid view queryRef'));

  const layoutProp = node.properties.get('layout');
  if (!layoutProp || layoutProp.kind !== 'text') return err(new Error('Invalid view layout'));

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
  return Array.from(graph.nodes.values()).filter(
    (node) => node.type === SYSTEM_IDS.VIEW_DEFINITION
  );
}

export function resolveView(graph: Graph, viewNodeId: NodeId): Result<ResolvedView, Error> {
  const viewDef = getViewDefinition(graph, viewNodeId);
  if (!viewDef.ok) return err(viewDef.error);

  const queryDef = getQueryDefinition(graph, viewDef.value.queryRef);
  if (!queryDef.ok) return err(queryDef.error);

  return ok({
    definition: viewDef.value,
    query: queryDef.value
  });
}
