import type { Graph, Node, NodeId, Result, GraphResult } from '@canopy/types';
import { createNodeId, createInstant } from '@canopy/types';
import { SYSTEM_IDS } from '../system';
import type { ScopeType } from '../settings';
import { addNode } from './node';
import type { NodeOperationOptions } from './node';

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
  params: AddUserSettingParams,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  const properties = new Map<string, string>([
    ['schemaId', params.schemaId],
    ['value', JSON.stringify(params.value)],
    ['scopeType', params.scopeType],
  ]);

  if (params.scopeTarget !== undefined) {
    // eslint-disable-next-line functional/immutable-data
    properties.set('scopeTarget', params.scopeTarget);
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
