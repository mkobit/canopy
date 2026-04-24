import type { Node, GraphEvent, TypeId } from '@canopy/types';
import { fromThrowable, asTypeId } from '@canopy/types';

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
