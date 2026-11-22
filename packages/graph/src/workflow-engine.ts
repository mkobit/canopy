import type { Node } from './node';
import type { Edge } from './edge';
import type { GraphEvent, GraphResult } from './events';
import type { ShapeId, NodeId } from './identifiers';
import type { Graph } from './graph';
import type { PropertyValue } from './properties';
import type { Result } from './result';
import { asShapeId, createInstant, createEdgeId } from './factories';
import { fromThrowable, err as error } from './result';
import { addEdge } from './ops/edge';
import { updateNode } from './ops/node';

export interface WorkflowActionParameters {
  readonly shape?: ShapeId | undefined;
  /**
  @deprecated Use shape
  */
  readonly type?: ShapeId | undefined;
  readonly source?: NodeId | undefined;
  readonly target?: NodeId | undefined;
  readonly properties?: ReadonlyMap<string, PropertyValue> | undefined;
  readonly nodeId?: NodeId | undefined;
  readonly key?: string | undefined;
  readonly value?: PropertyValue | undefined;
}

export function executeWorkflowAction(
  graph: Graph,
  action: string,
  parameters: WorkflowActionParameters,
): Result<GraphResult<Graph>, Error> {
  if (action === 'create-edge') {
    const edgeShape = parameters.shape ?? parameters.type;
    if (!edgeShape || !parameters.source || !parameters.target) {
      return error(new Error("Missing required parameters for 'create-edge' action"));
    }

    const edge: Edge = {
      id: createEdgeId(),
      shape: edgeShape,
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
    current: new Map<ShapeId, readonly Node[]>() as ReadonlyMap<ShapeId, readonly Node[]>,
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
    if (
      typeof condition === 'object' &&
      condition !== null &&
      ('shapeId' in condition || 'typeId' in condition)
    ) {
      const rawShapeId =
        'shapeId' in condition && typeof condition.shapeId === 'string'
          ? condition.shapeId
          : (condition as Readonly<{ typeId: string }>).typeId;
      const shapeId = asShapeId(rawShapeId);
      const current = triggersCell.current.get(shapeId) ?? [];
      triggersCell.current = new Map([...triggersCell.current, [shapeId, [...current, node]]]);
      return true;
    }

    return false;
  };

  const getTriggersForEvent = (event: GraphEvent): readonly Node[] => {
    return event.type === 'NodeCreated' && event.shapeId !== undefined
      ? (triggersCell.current.get(event.shapeId) ?? [])
      : [];
  };

  return {
    addTrigger,
    getTriggersForEvent,
  };
}
