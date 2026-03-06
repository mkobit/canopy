import { describe, it, expect, setSystemTime } from 'bun:test';
import {
  unwrap,
  createEventId,
  createNodeId,
  createEdgeId,
  asTypeId,
  asDeviceId,
  createInstant,
} from '@canopy/types';
import type {
  NodeCreated,
  NodePropertiesUpdated,
  NodeDeleted,
  EdgeCreated,
  EdgePropertiesUpdated,
  EdgeDeleted,
} from '@canopy/types';
import { InMemoryGraphStore } from './in-memory-graph-store';

describe('InMemoryGraphStore', () => {
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');

  const createNodeEvent = (id = createNodeId(), timestamp = createInstant()): NodeCreated => ({
    type: 'NodeCreated',
    eventId: createEventId(),
    id,
    nodeType: asTypeId('test-node'),
    properties: new Map([['key1', 'value1']]),
    timestamp,
    deviceId,
  });

  const createEdgeEvent = (
    id = createEdgeId(),
    source = createNodeId(),
    target = createNodeId(),
    timestamp = createInstant(),
  ): EdgeCreated => ({
    type: 'EdgeCreated',
    eventId: createEventId(),
    id,
    edgeType: asTypeId('test-edge'),
    source,
    target,
    properties: new Map([['key1', 'value1']]),
    timestamp,
    deviceId,
  });

  it('applyEvents with NodeCreated adds node to store', () => {
    const store = new InMemoryGraphStore();
    const event = createNodeEvent();

    unwrap(store.applyEvents([event]));

    const node = store.getNode(event.id);
    expect(node).toBeDefined();
    expect(node?.id).toBe(event.id);
    expect(node?.type).toBe(event.nodeType);
    expect(node?.properties.get('key1')).toBe('value1');
    expect(node?.metadata.created).toBe(event.timestamp);
    expect(node?.metadata.modified).toBe(event.timestamp);
  });

  it('applyEvents with NodePropertiesUpdated merges properties', () => {
    const store = new InMemoryGraphStore();
    const createEvent = createNodeEvent();

    setSystemTime(new Date(Date.now() + 1000));
    const updateEvent: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: createEvent.id,
      changes: new Map([
        ['key1', 'new-value1'],
        ['key2', 'value2'],
      ]),
      timestamp: createInstant(),
      deviceId,
    };

    unwrap(store.applyEvents([createEvent, updateEvent]));

    const node = store.getNode(createEvent.id);
    expect(node?.properties.get('key1')).toBe('new-value1');
    expect(node?.properties.get('key2')).toBe('value2');
    expect(node?.metadata.created).toBe(createEvent.timestamp);
    expect(node?.metadata.modified).toBe(updateEvent.timestamp);
  });

  it('applyEvents with NodeDeleted removes node and connected edges', () => {
    const store = new InMemoryGraphStore();
    const node1Event = createNodeEvent();
    const node2Event = createNodeEvent();
    const edgeEvent = createEdgeEvent(undefined, node1Event.id, node2Event.id);

    unwrap(store.applyEvents([node1Event, node2Event, edgeEvent]));

    expect(store.getNode(node1Event.id)).toBeDefined();
    expect(store.getEdge(edgeEvent.id)).toBeDefined();

    const deleteEvent: NodeDeleted = {
      type: 'NodeDeleted',
      eventId: createEventId(),
      id: node1Event.id,
      timestamp: createInstant(),
      deviceId,
    };

    unwrap(store.applyEvents([deleteEvent]));

    expect(store.getNode(node1Event.id)).toBeUndefined();
    expect(store.getEdge(edgeEvent.id)).toBeUndefined();
  });

  it('applyEvents with EdgeCreated adds edge', () => {
    const store = new InMemoryGraphStore();
    const event = createEdgeEvent();

    unwrap(store.applyEvents([event]));

    const edge = store.getEdge(event.id);
    expect(edge).toBeDefined();
    expect(edge?.id).toBe(event.id);
    expect(edge?.type).toBe(event.edgeType);
    expect(edge?.source).toBe(event.source);
    expect(edge?.target).toBe(event.target);
    expect(edge?.properties.get('key1')).toBe('value1');
    expect(edge?.metadata.created).toBe(event.timestamp);
    expect(edge?.metadata.modified).toBe(event.timestamp);
  });

  it('applyEvents with EdgePropertiesUpdated merges properties', () => {
    const store = new InMemoryGraphStore();
    const createEvent = createEdgeEvent();

    setSystemTime(new Date(Date.now() + 1000));
    const updateEvent: EdgePropertiesUpdated = {
      type: 'EdgePropertiesUpdated',
      eventId: createEventId(),
      id: createEvent.id,
      changes: new Map([
        ['key1', 'new-value1'],
        ['key2', 'value2'],
      ]),
      timestamp: createInstant(),
      deviceId,
    };

    unwrap(store.applyEvents([createEvent, updateEvent]));

    const edge = store.getEdge(createEvent.id);
    expect(edge?.properties.get('key1')).toBe('new-value1');
    expect(edge?.properties.get('key2')).toBe('value2');
    expect(edge?.metadata.created).toBe(createEvent.timestamp);
    expect(edge?.metadata.modified).toBe(updateEvent.timestamp);
  });

  it('applyEvents with EdgeDeleted removes edge', () => {
    const store = new InMemoryGraphStore();
    const createEvent = createEdgeEvent();

    unwrap(store.applyEvents([createEvent]));
    expect(store.getEdge(createEvent.id)).toBeDefined();

    const deleteEvent: EdgeDeleted = {
      type: 'EdgeDeleted',
      eventId: createEventId(),
      id: createEvent.id,
      timestamp: createInstant(),
      deviceId,
    };

    unwrap(store.applyEvents([deleteEvent]));
    expect(store.getEdge(createEvent.id)).toBeUndefined();
  });

  it('getNode returns undefined for missing node', () => {
    const store = new InMemoryGraphStore();
    expect(store.getNode(createNodeId())).toBeUndefined();
  });

  it('getNodes with type filter returns only matching nodes', () => {
    const store = new InMemoryGraphStore();
    const event1 = createNodeEvent();
    const event2 = createNodeEvent();
    const event3 = { ...createNodeEvent(), nodeType: asTypeId('other-node') };

    unwrap(store.applyEvents([event1, event2, event3]));

    const allNodes = store.getNodes();
    expect(allNodes).toHaveLength(3);

    const filteredNodes = store.getNodes({ type: asTypeId('test-node') });
    expect(filteredNodes).toHaveLength(2);
    expect(filteredNodes.map((n) => n.id)).toContain(event1.id);
    expect(filteredNodes.map((n) => n.id)).toContain(event2.id);
  });

  it('getNodes with properties filter returns only matching nodes', () => {
    const store = new InMemoryGraphStore();
    const event1 = createNodeEvent();
    const event2 = { ...createNodeEvent(), properties: new Map([['key1', 'value2']]) };

    unwrap(store.applyEvents([event1, event2]));

    const filteredNodes = store.getNodes({ properties: new Map([['key1', 'value1']]) });
    expect(filteredNodes).toHaveLength(1);
    expect(filteredNodes[0]?.id).toBe(event1.id);
  });

  it('getEdgesFrom returns edges from a specific node', () => {
    const store = new InMemoryGraphStore();
    const sourceNode = createNodeId();
    const targetNode1 = createNodeId();
    const targetNode2 = createNodeId();

    const edge1 = createEdgeEvent(undefined, sourceNode, targetNode1);
    const edge2 = createEdgeEvent(undefined, sourceNode, targetNode2);
    const edge3 = createEdgeEvent(undefined, createNodeId(), targetNode1); // different source

    unwrap(store.applyEvents([edge1, edge2, edge3]));

    const edges = store.getEdgesFrom(sourceNode);
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.id)).toContain(edge1.id);
    expect(edges.map((e) => e.id)).toContain(edge2.id);
  });

  it('getEdgesTo returns edges to a specific node', () => {
    const store = new InMemoryGraphStore();
    const targetNode = createNodeId();
    const sourceNode1 = createNodeId();
    const sourceNode2 = createNodeId();

    const edge1 = createEdgeEvent(undefined, sourceNode1, targetNode);
    const edge2 = createEdgeEvent(undefined, sourceNode2, targetNode);
    const edge3 = createEdgeEvent(undefined, sourceNode1, createNodeId()); // different target

    unwrap(store.applyEvents([edge1, edge2, edge3]));

    const edges = store.getEdgesTo(targetNode);
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.id)).toContain(edge1.id);
    expect(edges.map((e) => e.id)).toContain(edge2.id);
  });

  it('getEdgesFrom with edgeType filter returns only matching edges', () => {
    const store = new InMemoryGraphStore();
    const sourceNode = createNodeId();

    const edge1 = createEdgeEvent(undefined, sourceNode, createNodeId());
    const edge2 = {
      ...createEdgeEvent(undefined, sourceNode, createNodeId()),
      edgeType: asTypeId('other-edge'),
    };

    unwrap(store.applyEvents([edge1, edge2]));

    const edges = store.getEdgesFrom(sourceNode, asTypeId('test-edge'));
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe(edge1.id);
  });

  it('getSnapshot and loadSnapshot round-trip correctly', () => {
    const store1 = new InMemoryGraphStore();
    const nodeEvent = createNodeEvent();
    const edgeEvent = createEdgeEvent(undefined, nodeEvent.id, createNodeId());

    unwrap(store1.applyEvents([nodeEvent, edgeEvent]));
    const snapshot = store1.getSnapshot();

    const store2 = new InMemoryGraphStore();
    unwrap(store2.loadSnapshot(snapshot));

    expect(store2.getNode(nodeEvent.id)).toBeDefined();
    expect(store2.getEdge(edgeEvent.id)).toBeDefined();
    expect(store2.getSnapshot().lastEventId).toBe(edgeEvent.eventId);
  });

  it('lastEventId is updated after applyEvents', () => {
    const store = new InMemoryGraphStore();
    const event1 = createNodeEvent();
    const event2 = createNodeEvent();

    unwrap(store.applyEvents([event1]));
    expect(store.getSnapshot().lastEventId).toBe(event1.eventId);

    unwrap(store.applyEvents([event2]));
    expect(store.getSnapshot().lastEventId).toBe(event2.eventId);
  });
});
