import type { Node } from './node';
import type { GraphEvent, GraphResult } from './events';
import type { TypeId, NodeId } from './identifiers';
import type { Graph } from './graph';
import type { PropertyValue } from './properties';
import type { Result } from './result';
import { asTypeId, createInstant, createEdgeId } from './factories';
import { fromThrowable, err as error } from './result';
import { addEdge } from './ops/edge';
import { updateNode } from './ops/node';

export interface WorkflowActionParameters {
  readonly type?: TypeId;
  readonly source?: NodeId;
  readonly target?: NodeId;
  readonly properties?: ReadonlyMap<string, PropertyValue>;
  readonly nodeId?: NodeId;
  readonly key?: string;
  readonly value?: PropertyValue;
}

export function executeWorkflowAction(
  graph: Graph,
  action: string,
  parameters: WorkflowActionParameters,
): Result<GraphResult<Graph>, Error> {
  if (action === 'create-edge') {
    if (!parameters.type || !parameters.source || !parameters.target) {
      return error(new Error("Missing required parameters for 'create-edge' action"));
    }

    const edge = {
      id: createEdgeId(),
      type: parameters.type,
      source: parameters.source,
      target: parameters.target,
      properties: new Map(parameters.properties),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: graph.metadata.modifiedBy,
      },
    };

    return addEdge(graph, edge, {
      deviceId: graph.metadata.modifiedBy,
    });
  }

  if (action === 'set-property') {
    if (!parameters.nodeId || !parameters.key || parameters.value === undefined) {
      return error(new Error("Missing required parameters for 'set-property' action"));
    }

    return updateNode(
      graph,
      parameters.nodeId,
      (node) => ({
        ...node,
        properties: new Map([
          ...node.properties,
          [parameters.key as string, parameters.value as PropertyValue],
        ]),
      }),
      { deviceId: graph.metadata.modifiedBy },
    );
  }

  return error(new Error(`Unknown action: ${action}`));
}

export interface WorkflowEngine {
  readonly executeAction: (
    graph: Graph,
    action: string,
    parameters: WorkflowActionParameters,
  ) => Result<GraphResult<Graph>, Error>;
}

export function createWorkflowEngine(): WorkflowEngine {
  return {
    executeAction: executeWorkflowAction,
  };
}

export interface WorkflowTriggerRegistry {
  readonly addTrigger: (node: Node) => boolean;
  readonly getTriggersForEvent: (event: GraphEvent) => readonly Node[];
}

export function createWorkflowTriggerRegistry(): WorkflowTriggerRegistry {
  const triggersCell = {
    current: new Map<TypeId, readonly Node[]>() as ReadonlyMap<TypeId, readonly Node[]>,
  };

  const addTrigger = (node: Node): boolean => {
    const conditionString = node.properties.get('condition');
    if (typeof conditionString !== 'string') {
      return false;
    }

    const parsedResult = fromThrowable(() => JSON.parse(conditionString));
    if (!parsedResult.ok) {
      return false;
    }

    const condition = parsedResult.value;
    if (typeof condition === 'object' && condition !== null && 'typeId' in condition) {
      const typeId = asTypeId((condition as Readonly<{ typeId: string }>).typeId);
      const current = triggersCell.current.get(typeId) ?? [];
      triggersCell.current = new Map([...triggersCell.current, [typeId, [...current, node]]]);
      return true;
    }

    return false;
  };

  const getTriggersForEvent = (event: GraphEvent): readonly Node[] => {
    if (event.type === 'NodeCreated') {
      return triggersCell.current.get(event.nodeType) ?? [];
    }
    return [];
  };

  return {
    addTrigger,
    getTriggersForEvent,
  };
}
