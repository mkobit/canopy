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

// eslint-disable-next-line functional/no-classes
export class WorkflowEngine {
  public executeAction(
    graph: Graph,
    action: string,
    parameters: Readonly<{
      type?: TypeId;
      source?: NodeId;
      target?: NodeId;
      properties?: ReadonlyMap<string, PropertyValue>;
      nodeId?: NodeId;
      key?: string;
      value?: PropertyValue;
    }>,
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
        (node) => {
          const properties = new Map(node.properties);
          properties.set(parameters.key as string, parameters.value as PropertyValue);
          return {
            ...node,
            properties,
          };
        },
        { deviceId: graph.metadata.modifiedBy },
      );
    }

    return error(new Error(`Unknown action: ${action}`));
  }
}

// eslint-disable-next-line functional/no-classes
export class WorkflowTriggerRegistry {
  private readonly triggers = new Map<TypeId, readonly Node[]>();

  // eslint-disable-next-line functional/no-return-void
  public addTrigger(node: Node): void {
    const conditionString = node.properties.get('condition');
    if (typeof conditionString !== 'string') {
      return;
    }

    const parsedResult = fromThrowable(() => JSON.parse(conditionString));
    if (!parsedResult.ok) {
      return;
    }

    const condition = parsedResult.value;
    if (typeof condition === 'object' && condition !== null && 'typeId' in condition) {
      const typeId = asTypeId((condition as Readonly<{ typeId: string }>).typeId);
      // eslint-disable-next-line functional/no-this-expressions
      const current = this.triggers.get(typeId) ?? [];
      // eslint-disable-next-line functional/no-this-expressions
      this.triggers.set(typeId, [...current, node]);
    }
  }

  public getTriggersForEvent(event: GraphEvent): readonly Node[] {
    if (event.type === 'NodeCreated') {
      // eslint-disable-next-line functional/no-this-expressions
      return this.triggers.get(event.nodeType) ?? [];
    }
    return [];
  }
}
