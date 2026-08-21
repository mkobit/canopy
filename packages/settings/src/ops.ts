import type { Graph, Node, NodeId, Result, GraphResult, NodeOperationOptions } from '@canopy/graph';
import { createNodeId, createInstant, SYSTEM_IDS, addNode } from '@canopy/graph';
import type { ScopeType } from './cascade';

export type AddUserSettingParameters = Readonly<{
  schemaId: NodeId;
  value: unknown;
  scopeType: ScopeType;
  scopeTarget?: string;
}>;

/**
 * Creates a USER_SETTING node in the graph.
 */
export function addUserSetting(
  graph: Graph,
  parameters: AddUserSettingParameters,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  const baseEntries: readonly (readonly [string, string])[] = [
    ['schemaId', parameters.schemaId],
    ['value', JSON.stringify(parameters.value)],
    ['scopeType', parameters.scopeType],
  ];

  const entries: readonly (readonly [string, string])[] =
    parameters.scopeTarget === undefined
      ? baseEntries
      : [...baseEntries, ['scopeTarget', parameters.scopeTarget]];

  const properties = new Map<string, string>(entries);

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
