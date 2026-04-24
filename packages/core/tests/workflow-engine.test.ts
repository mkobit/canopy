import { describe, it, expect } from 'bun:test';
import { WorkflowTriggerRegistry } from '../src/workflow-engine';
import {
  Node,
  NodeCreated,
  createNodeId,
  createEventId,
  createInstant,
  asDeviceId,
  asTypeId,
} from '@canopy/types';

describe('WorkflowTriggerRegistry', () => {
  it('should register and match a trigger for NodeCreated event', () => {
    const registry = new WorkflowTriggerRegistry();
    const typeId = asTypeId('test-type-id');

    const node: Node = {
      id: createNodeId(),
      type: asTypeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', JSON.stringify({ typeId })]]),
    };

    registry.addTrigger(node);

    const event: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: createNodeId(),
      nodeType: typeId,
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: asDeviceId('test-device'),
    };

    const triggers = registry.getTriggersForEvent(event);
    expect(triggers.length).toBe(1);
    expect(triggers[0]).toBe(node);
  });
});
