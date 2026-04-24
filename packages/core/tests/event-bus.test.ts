import { describe, expect, test, mock } from 'bun:test';
import { onNodeCreated } from '../src/event-bus';
import { asTypeId, asNodeId, asEventId, asDeviceId, asInstant } from '@canopy/types';
import type { NodeCreated, NodeDeleted } from '@canopy/types';

describe('EventBus Helpers', () => {
  describe('onNodeCreated', () => {
    test('invokes callback for NodeCreated event with matching typeId', () => {
      const callback = mock();
      const targetTypeId = asTypeId('type-A');
      const handler = onNodeCreated(targetTypeId, callback);

      const matchingEvent: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('e-1'),
        id: asNodeId('n-1'),
        nodeType: targetTypeId,
        properties: {},
        timestamp: asInstant('2024-01-01T00:00:00Z'),
        deviceId: asDeviceId('d-1'),
      };

      handler([matchingEvent]);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(matchingEvent);
    });

    test('ignores NodeCreated events with non-matching typeId', () => {
      const callback = mock();
      const targetTypeId = asTypeId('type-A');
      const otherTypeId = asTypeId('type-B');
      const handler = onNodeCreated(targetTypeId, callback);

      const nonMatchingEvent: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('e-1'),
        id: asNodeId('n-1'),
        nodeType: otherTypeId,
        properties: {},
        timestamp: asInstant('2024-01-01T00:00:00Z'),
        deviceId: asDeviceId('d-1'),
      };

      handler([nonMatchingEvent]);

      expect(callback).toHaveBeenCalledTimes(0);
    });

    test('ignores non-NodeCreated events', () => {
      const callback = mock();
      const targetTypeId = asTypeId('type-A');
      const handler = onNodeCreated(targetTypeId, callback);

      const otherEvent: NodeDeleted = {
        type: 'NodeDeleted',
        eventId: asEventId('e-1'),
        id: asNodeId('n-1'),
        timestamp: asInstant('2024-01-01T00:00:00Z'),
        deviceId: asDeviceId('d-1'),
      };

      handler([otherEvent]);

      expect(callback).toHaveBeenCalledTimes(0);
    });

    test('handles batch of events correctly', () => {
      const callback = mock();
      const targetTypeId = asTypeId('type-A');
      const otherTypeId = asTypeId('type-B');
      const handler = onNodeCreated(targetTypeId, callback);

      const matchingEvent1: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('e-1'),
        id: asNodeId('n-1'),
        nodeType: targetTypeId,
        properties: {},
        timestamp: asInstant('2024-01-01T00:00:00Z'),
        deviceId: asDeviceId('d-1'),
      };

      const nonMatchingEvent: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('e-2'),
        id: asNodeId('n-2'),
        nodeType: otherTypeId,
        properties: {},
        timestamp: asInstant('2024-01-01T00:00:00Z'),
        deviceId: asDeviceId('d-1'),
      };

      const matchingEvent2: NodeCreated = {
        type: 'NodeCreated',
        eventId: asEventId('e-3'),
        id: asNodeId('n-3'),
        nodeType: targetTypeId,
        properties: {},
        timestamp: asInstant('2024-01-01T00:00:00Z'),
        deviceId: asDeviceId('d-1'),
      };

      handler([matchingEvent1, nonMatchingEvent, matchingEvent2]);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback.mock.calls[0][0]).toBe(matchingEvent1);
      expect(callback.mock.calls[1][0]).toBe(matchingEvent2);
    });
  });
});
