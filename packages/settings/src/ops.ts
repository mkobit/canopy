import type { Graph, Node, NodeId, Result, GraphResult, NodeOperationOptions } from '@canopy/graph';
import { createNodeId, createInstant, SYSTEM_IDS, addNode } from '@canopy/graph';
import type { ScopeType } from './cascade';

export type AddUserSettingParams = Readonly<{
  schemaId: NodeId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  scopeType: ScopeType;
  scopeTarget?: string;
}>;

/**
 * Creates a USER_SETTING node in the graph.
 */
export function addUserSetting(
  graph: Graph,
  parameters: AddUserSettingParams,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  const properties = new Map<string, string>([
    ['schemaId', parameters.schemaId],
    ['value', JSON.stringify(parameters.value)],
    ['scopeType', parameters.scopeType],
  ]);

  if (parameters.scopeTarget !== undefined) {
    // eslint-disable-next-line functional/immutable-data
    properties.set('scopeTarget', parameters.scopeTarget);
  }

  const node: Node = {
    id: createNodeId(),
    type: SYSTEM_IDS.USER_SETTING,
    properties,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  return addNode(graph, node, options);
}
