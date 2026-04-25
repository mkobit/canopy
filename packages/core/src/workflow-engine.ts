import type {
  Node,
  GraphEvent,
  TypeId,
  Graph,
  NodeId,
  PropertyValue,
  Result,
  GraphResult,
} from '@canopy/types';
import { fromThrowable, asTypeId, createInstant, createEdgeId, err } from '@canopy/types';
import { addEdge } from './ops/edge';

// eslint-disable-next-line functional/no-classes
export class WorkflowEngine {
  public executeAction(
    graph: Graph,
    action: string,
    params: Readonly<{
      type?: TypeId;
      source?: NodeId;
      target?: NodeId;
      properties?: ReadonlyMap<string, PropertyValue>;
    }>,
  ): Result<GraphResult<Graph>, Error> {
    if (action === 'create-edge') {
      if (!params.type || !params.source || !params.target) {
        return err(new Error("Missing required parameters for 'create-edge' action"));
      }

      const edge = {
        id: createEdgeId(),
        type: params.type,
        source: params.source,
        target: params.target,
        properties: new Map(params.properties),
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

    return err(new Error(`Unknown action: ${action}`));
  }
}

// eslint-disable-next-line functional/no-classes
export class WorkflowTriggerRegistry {
  private readonly triggers = new Map<TypeId, readonly Node[]>();

  // eslint-disable-next-line functional/no-return-void
  public addTrigger(node: Node): void {
    const conditionStr = node.properties.get('condition');
    if (typeof conditionStr !== 'string') {
      return;
    }

    const parsedResult = fromThrowable(() => JSON.parse(conditionStr));
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
