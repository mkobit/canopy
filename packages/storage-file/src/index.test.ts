import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  unwrap,
  createEventId,
  createNodeId,
  createEdgeId,
  createGraphId,
  createGraphSession,
  createIndexedReadModel,
  canonicalizeUri,
  asShapeId,
  asBatchId,
  asDeviceId,
  createInstant,
  SYSTEM_IDS,
  SYSTEM_EDGE_SHAPES,
} from '@canopy/graph';
import type { GraphEvent } from '@canopy/graph';
import {
  createFileEventLog,
  scanRemoteManifests,
  getRemoteSegmentsInOrder,
  readRemoteSegmentEvents,
} from './file-event-log';
import type { FileEventLog } from './file-event-log';

const serializeEventForTest = (event: GraphEvent): string => {
  return JSON.stringify({
    ...event,
    properties: 'properties' in event ? Object.fromEntries(event.properties) : undefined,
  });
};

describe('FileEventLog', () => {
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');
  const timestamp = createInstant();

  const createTestEvent = (): GraphEvent => ({
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    shapeId: asShapeId('test-node'),
    properties: new Map(),
    timestamp,
    deviceId,
  });

  let temporaryDirectory: string;
  let store: FileEventLog;

  beforeEach(async () => {
    temporaryDirectory = path.join(__dirname, `../dist/test-temp-${Math.random()}`);
    await fs.mkdir(temporaryDirectory, { recursive: true });
    store = createFileEventLog({
      rootDir: temporaryDirectory,
      deviceId: 'device-1',
      maxEventsPerSegment: 3,
      maxBytesPerSegment: 1024,
    });
    await unwrap(await store.init());
  });

  afterEach(async () => {
    await unwrap(await store.close());
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('appends events and retrieves them in order', async () => {
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event2, event1]);
    await store.appendEvents('graph1', [event3]);

    const result = unwrap(await store.getEvents('graph1'));
    const expected = [event1, event2, event3].toSorted((a, b) =>
      a.eventId.localeCompare(b.eventId),
    );
    expect(result).toEqual(expected);
  });

  it('deduplicates events by eventId (idempotent append)', async () => {
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2]);
    await store.appendEvents('graph1', [event2, event1]);

    const result = unwrap(await store.getEvents('graph1'));
    expect(result).toHaveLength(2);
    const expected = [event1, event2].toSorted((a, b) => a.eventId.localeCompare(b.eventId));
    expect(result).toEqual(expected);
  });

  it('filters events using the "after" option', async () => {
    const sortedEvents = [createTestEvent(), createTestEvent(), createTestEvent()].toSorted(
      (a, b) => a.eventId.localeCompare(b.eventId),
    );
    const [event1, event2, event3] = sortedEvents;
    if (!event1 || !event2 || !event3) {
      throw new Error('Expected 3 events');
    }

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { after: event1.eventId }));
    expect(result).toEqual([event2, event3]);
  });

  it('filters events using the "before" option', async () => {
    const sortedEvents = [createTestEvent(), createTestEvent(), createTestEvent()].toSorted(
      (a, b) => a.eventId.localeCompare(b.eventId),
    );
    const [event1, event2, event3] = sortedEvents;
    if (!event1 || !event2 || !event3) {
      throw new Error('Expected 3 events');
    }

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { before: event3.eventId }));
    expect(result).toEqual([event1, event2]);
  });

  it('limits the number of returned events using the "limit" option', async () => {
    const sortedEvents = [createTestEvent(), createTestEvent(), createTestEvent()].toSorted(
      (a, b) => a.eventId.localeCompare(b.eventId),
    );
    const [event1, event2] = sortedEvents;
    if (event1 === undefined || event2 === undefined) {
      throw new Error('Expected 2 events');
    }

    await store.appendEvents('graph1', sortedEvents);

    const result = unwrap(await store.getEvents('graph1', { limit: 2 }));
    expect(result).toEqual([event1, event2]);
  });

  it('reverses the returned events using the "reverse" option', async () => {
    const sortedEvents = [createTestEvent(), createTestEvent(), createTestEvent()].toSorted(
      (a, b) => a.eventId.localeCompare(b.eventId),
    );
    const [event1, event2, event3] = sortedEvents;
    if (!event1 || !event2 || !event3) {
      throw new Error('Expected 3 events');
    }

    await store.appendEvents('graph1', sortedEvents);

    const result = unwrap(await store.getEvents('graph1', { reverse: true }));
    expect(result).toEqual([event3, event2, event1]);
  });

  it('seals segments correctly based on maxEventsPerSegment', async () => {
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();
    const event4 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);
    await store.appendEvents('graph1', [event4]);

    const manifestContent = await fs.readFile(
      path.join(temporaryDirectory, 'events/device-1/manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestContent);

    expect(manifest.sealed).toHaveLength(1);
    expect(manifest.lastEventId).toBe(event4.eventId);

    const result = unwrap(await store.getEvents('graph1'));
    const expected = [event1, event2, event3, event4].toSorted((a, b) =>
      a.eventId.localeCompare(b.eventId),
    );
    expect(result).toEqual(expected);
  });

  it('reconstructs events after reload', async () => {
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2]);

    await unwrap(await store.close());

    const newStore = createFileEventLog({
      rootDir: temporaryDirectory,
      deviceId: 'device-1',
      maxEventsPerSegment: 3,
      maxBytesPerSegment: 1024,
    });
    await unwrap(await newStore.init());

    const result = unwrap(await newStore.getEvents('graph1'));
    const expected = [event1, event2].toSorted((a, b) => a.eventId.localeCompare(b.eventId));
    expect(result).toEqual(expected);

    await unwrap(await newStore.close());
  });

  it('maintains batch integrity when batch size exceeds maxEventsPerSegment', async () => {
    const batchStore = createFileEventLog({
      rootDir: temporaryDirectory,
      deviceId: 'device-1',
      maxEventsPerSegment: 2,
      maxBytesPerSegment: 1024,
    });
    await unwrap(await batchStore.init());

    const batchId = asBatchId('batch-1');
    const event1 = { ...createTestEvent(), batchId };
    const event2 = { ...createTestEvent(), batchId };
    const event3 = { ...createTestEvent(), batchId };

    await batchStore.appendEvents('graph1', [event1, event2, event3]);

    const manifestContent = await fs.readFile(
      path.join(temporaryDirectory, 'events/device-1/manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestContent);

    expect(manifest.sealed).toHaveLength(1);
    expect(manifest.lastEventId).toBe(event3.eventId);

    const segmentFile = manifest.sealed[0];
    const segmentContent = await fs.readFile(
      path.join(temporaryDirectory, 'events/device-1', segmentFile),
      'utf8',
    );
    const lines = segmentContent.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(3);

    await unwrap(await batchStore.close());
  });

  it('seals segments correctly based on maxBytesPerSegment', async () => {
    const byteStore = createFileEventLog({
      rootDir: temporaryDirectory,
      deviceId: 'device-1',
      maxEventsPerSegment: 1000,
      maxBytesPerSegment: 300,
    });
    await unwrap(await byteStore.init());

    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await byteStore.appendEvents('graph1', [event1, event2, event3]);

    const manifestContent = await fs.readFile(
      path.join(temporaryDirectory, 'events/device-1/manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestContent);

    expect(manifest.sealed).toHaveLength(2);
    expect(manifest.lastEventId).toBe(event3.eventId);

    const result = unwrap(await byteStore.getEvents('graph1'));
    const expected = [event1, event2, event3].toSorted((a, b) =>
      a.eventId.localeCompare(b.eventId),
    );
    expect(result).toEqual(expected);

    await unwrap(await byteStore.close());
  });

  it('preserves remote watermarks in the manifest across reads/writes', async () => {
    const deviceDirectory = path.join(temporaryDirectory, 'events/device-1');
    await fs.mkdir(deviceDirectory, { recursive: true });
    const initialManifest = {
      sealed: [],
      lastEventId: null,
      watermarks: {
        'remote-device-1': 'event-123',
      },
    };
    await fs.writeFile(
      path.join(deviceDirectory, 'manifest.json'),
      JSON.stringify(initialManifest, null, 2),
      'utf8',
    );

    const watermarkStore = createFileEventLog({
      rootDir: temporaryDirectory,
      deviceId: 'device-1',
      maxEventsPerSegment: 10,
      maxBytesPerSegment: 1024,
    });
    await unwrap(await watermarkStore.init());

    const event = createTestEvent();
    await watermarkStore.appendEvents('graph1', [event]);

    const manifestContent = await fs.readFile(path.join(deviceDirectory, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestContent);
    expect(manifest.watermarks).toEqual({
      'remote-device-1': 'event-123',
    });

    await unwrap(await watermarkStore.close());
  });

  describe('remote device helpers', () => {
    it('scanRemoteManifests returns empty map if events dir does not exist', async () => {
      const nonExistentDirectory = path.join(temporaryDirectory, 'does-not-exist');
      const result = unwrap(await scanRemoteManifests(nonExistentDirectory, 'device-1'));
      expect(result.size).toBe(0);
    });

    it('scanRemoteManifests scans manifests and ignores local device', async () => {
      const eventsDirectory = path.join(temporaryDirectory, 'events');
      await fs.mkdir(path.join(eventsDirectory, 'device-1'), { recursive: true });
      await fs.mkdir(path.join(eventsDirectory, 'device-2'), { recursive: true });
      await fs.mkdir(path.join(eventsDirectory, 'device-3'), { recursive: true });

      const manifest2 = {
        sealed: ['1.jsonl'],
        lastEventId: 'event-2',
        watermarks: {},
      };
      const manifest3 = {
        sealed: ['2.jsonl'],
        lastEventId: 'event-3',
        watermarks: { 'device-2': 'event-1' },
      };

      await fs.writeFile(
        path.join(eventsDirectory, 'device-2', 'manifest.json'),
        JSON.stringify(manifest2),
        'utf8',
      );
      await fs.writeFile(
        path.join(eventsDirectory, 'device-3', 'manifest.json'),
        JSON.stringify(manifest3),
        'utf8',
      );

      const result = unwrap(await scanRemoteManifests(temporaryDirectory, 'device-1'));
      expect(result.size).toBe(2);
      expect(result.has('device-2')).toBe(true);
      expect(result.has('device-3')).toBe(true);
      expect(result.has('device-1')).toBe(false);

      const scanned2 = result.get('device-2');
      expect(scanned2?.lastEventId).toBe('event-2');
      expect(scanned2?.sealed).toEqual(['1.jsonl']);

      const scanned3 = result.get('device-3');
      expect(scanned3?.lastEventId).toBe('event-3');
      expect(scanned3?.watermarks).toEqual({ 'device-2': 'event-1' });
    });

    it('getRemoteSegmentsInOrder returns sorted segments and handles empty/missing dir', async () => {
      const remoteDeviceDirectory = path.join(temporaryDirectory, 'events/device-2');
      const missingDirectoryResult = unwrap(await getRemoteSegmentsInOrder(remoteDeviceDirectory));
      expect(missingDirectoryResult).toEqual([]);

      await fs.mkdir(remoteDeviceDirectory, { recursive: true });
      await fs.writeFile(path.join(remoteDeviceDirectory, 'b.jsonl'), 'data');
      await fs.writeFile(path.join(remoteDeviceDirectory, 'a.jsonl'), 'data');
      await fs.writeFile(path.join(remoteDeviceDirectory, 'other.txt'), 'data');

      const result = unwrap(await getRemoteSegmentsInOrder(remoteDeviceDirectory));
      expect(result).toEqual(['a.jsonl', 'b.jsonl']);
    });

    it('readRemoteSegmentEvents reads and deserializes events correctly', async () => {
      const remoteDeviceDirectory = path.join(temporaryDirectory, 'events/device-2');
      await fs.mkdir(remoteDeviceDirectory, { recursive: true });

      const event1 = createTestEvent();
      const event2 = createTestEvent();

      const content = `${serializeEventForTest(event1)}\n${serializeEventForTest(event2)}\n`;
      await fs.writeFile(path.join(remoteDeviceDirectory, 'a.jsonl'), content, 'utf8');

      const result = unwrap(await readRemoteSegmentEvents(remoteDeviceDirectory, 'a.jsonl'));
      expect(result).toHaveLength(2);
      expect(result[0]?.eventId).toBe(event1.eventId);
      expect(result[1]?.eventId).toBe(event2.eventId);
    });
  });

  describe('reconcile', () => {
    it('does nothing when no remote devices exist', async () => {
      unwrap(await store.reconcile('graph1'));

      const events = unwrap(await store.getEvents('graph1'));
      expect(events).toHaveLength(0);
    });

    it('ingests remote events and updates local manifest watermarks', async () => {
      const remoteDeviceId = asDeviceId('00000000-0000-4000-8000-000000000002');
      const remoteDeviceDirectory = path.join(temporaryDirectory, 'events', remoteDeviceId);
      await fs.mkdir(remoteDeviceDirectory, { recursive: true });

      const event1 = { ...createTestEvent(), deviceId: remoteDeviceId };
      const event2 = { ...createTestEvent(), deviceId: remoteDeviceId };

      const content = `${serializeEventForTest(event1)}\n${serializeEventForTest(event2)}\n`;
      await fs.writeFile(path.join(remoteDeviceDirectory, '1.jsonl'), content, 'utf8');

      const remoteManifest = {
        sealed: ['1.jsonl'],
        lastEventId: event2.eventId,
        watermarks: {},
      };
      await fs.writeFile(
        path.join(remoteDeviceDirectory, 'manifest.json'),
        JSON.stringify(remoteManifest),
        'utf8',
      );

      unwrap(await store.reconcile('graph1'));

      const localEvents = unwrap(await store.getEvents('graph1'));
      expect(localEvents).toHaveLength(2);
      expect(localEvents.map((event) => event.eventId)).toContain(event1.eventId);
      expect(localEvents.map((event) => event.eventId)).toContain(event2.eventId);

      const manifestContent = await fs.readFile(
        path.join(temporaryDirectory, 'events/device-1/manifest.json'),
        'utf8',
      );
      const localManifest = JSON.parse(manifestContent);
      expect(localManifest.watermarks[remoteDeviceId as string]).toBe(event2.eventId);
    });

    it('only ingests new remote events beyond the watermark', async () => {
      const remoteDeviceId = asDeviceId('00000000-0000-4000-8000-000000000002');
      const remoteDeviceDirectory = path.join(temporaryDirectory, 'events', remoteDeviceId);
      await fs.mkdir(remoteDeviceDirectory, { recursive: true });

      const sortedEvents = [
        { ...createTestEvent(), deviceId: remoteDeviceId },
        { ...createTestEvent(), deviceId: remoteDeviceId },
        { ...createTestEvent(), deviceId: remoteDeviceId },
      ].toSorted((a, b) => a.eventId.localeCompare(b.eventId));

      const [event1, event2, event3] = sortedEvents;
      if (!event1 || !event2 || !event3) {
        throw new Error('Expected 3 sorted events');
      }

      const initialLocalManifest = {
        sealed: [],
        lastEventId: null,
        watermarks: {
          [remoteDeviceId as string]: event1.eventId,
        },
      };
      await fs.writeFile(
        path.join(temporaryDirectory, 'events/device-1/manifest.json'),
        JSON.stringify(initialLocalManifest),
        'utf8',
      );

      await fs.writeFile(
        path.join(remoteDeviceDirectory, '1.jsonl'),
        serializeEventForTest(event1) + '\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(remoteDeviceDirectory, '2.jsonl'),
        `${serializeEventForTest(event2)}\n${serializeEventForTest(event3)}\n`,
        'utf8',
      );

      const remoteManifest = {
        sealed: ['1.jsonl', '2.jsonl'],
        lastEventId: event3.eventId,
        watermarks: {},
      };
      await fs.writeFile(
        path.join(remoteDeviceDirectory, 'manifest.json'),
        JSON.stringify(remoteManifest),
        'utf8',
      );

      unwrap(await store.reconcile('graph1'));

      const localEvents = unwrap(await store.getEvents('graph1'));
      expect(localEvents).toHaveLength(2);
      expect(localEvents.map((event) => event.eventId)).not.toContain(event1.eventId);
      expect(localEvents.map((event) => event.eventId)).toContain(event2.eventId);
      expect(localEvents.map((event) => event.eventId)).toContain(event3.eventId);

      const manifestContent = await fs.readFile(
        path.join(temporaryDirectory, 'events/device-1/manifest.json'),
        'utf8',
      );
      const localManifest = JSON.parse(manifestContent);
      expect(localManifest.watermarks[remoteDeviceId as string]).toBe(event3.eventId);
    });
  });

  describe('legacy event upcasting and active-segment sealing', () => {
    it('replays legacy JSONL events and seals a legacy active segment without rewriting it', async () => {
      await unwrap(await store.close());
      const restartDirectory = path.join(temporaryDirectory, 'legacy-vault');
      const deviceDirectory = path.join(restartDirectory, 'events/device-legacy');
      await fs.mkdir(deviceDirectory, { recursive: true });

      const node1Id = createNodeId();
      const node2Id = createNodeId();
      const legacyEvent1 = {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: node1Id,
        nodeType: 'legacy:note',
        properties: { title: 'Legacy' },
        timestamp,
        deviceId,
      };
      const legacyEvent2 = {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: node2Id,
        nodeType: 'canopy:open',
        properties: {},
        timestamp,
        deviceId,
      };
      const legacyEdge = {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: createEdgeId(),
        edgeType: 'legacy:rel',
        source: node1Id,
        target: node2Id,
        properties: {},
        timestamp,
        deviceId,
      };

      const legacyFilename = `${legacyEvent1.eventId}.jsonl`;
      const originalContent =
        [legacyEvent1, legacyEvent2, legacyEdge].map((event) => JSON.stringify(event)).join('\n') +
        '\n';

      await fs.writeFile(
        path.join(restartDirectory, 'canopy.json'),
        JSON.stringify({ version: 1, graphId: 'legacy-graph', name: 'legacy-graph' }),
        'utf8',
      );
      await fs.writeFile(
        path.join(deviceDirectory, 'manifest.json'),
        JSON.stringify({ sealed: [], lastEventId: legacyEdge.eventId, watermarks: {} }),
        'utf8',
      );
      await fs.writeFile(path.join(deviceDirectory, legacyFilename), originalContent, 'utf8');

      const legacyStore = createFileEventLog({
        rootDir: restartDirectory,
        deviceId: 'device-legacy',
        maxEventsPerSegment: 100,
        maxBytesPerSegment: 65_536,
      });
      await unwrap(await legacyStore.init());

      const beforeAppend = unwrap(await legacyStore.getEvents('legacy-graph'));
      expect(beforeAppend).toHaveLength(3);
      expect(beforeAppend[0]?.type === 'NodeCreated' && beforeAppend[0].shapeId).toBe(
        asShapeId('legacy:note'),
      );
      expect(beforeAppend[1]?.type === 'NodeCreated' && beforeAppend[1].shapeId).toBeUndefined();
      expect(beforeAppend[2]?.type === 'EdgeCreated' && beforeAppend[2].shapeId).toBe(
        asShapeId('legacy:rel'),
      );

      // Appending a modern event must seal the legacy active segment without modifying it on disk
      const modernOpenNode: GraphEvent = {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: createNodeId(),
        properties: new Map([['kind', 'open']]),
        timestamp,
        deviceId,
      };
      await unwrap(await legacyStore.appendEvents('legacy-graph', [modernOpenNode]));

      const afterDiskLegacy = await fs.readFile(path.join(deviceDirectory, legacyFilename), 'utf8');
      expect(afterDiskLegacy).toBe(originalContent);

      const manifestAfter = JSON.parse(
        await fs.readFile(path.join(deviceDirectory, 'manifest.json'), 'utf8'),
      ) as { sealed: readonly string[] };
      expect(manifestAfter.sealed).toContain(legacyFilename);

      const afterAppend = unwrap(await legacyStore.getEvents('legacy-graph'));
      expect(afterAppend).toHaveLength(4);
      expect(afterAppend[3]?.type === 'NodeCreated' && afterAppend[3].shapeId).toBeUndefined();

      await unwrap(await legacyStore.close());
    });
  });

  describe('Concurrency and Journeys 1-3 over storage-file', () => {
    it('serializes concurrent appendEvents and reconcile calls without manifest corruption', async () => {
      const remoteDirectory = path.join(temporaryDirectory, 'events/device-2');
      await fs.mkdir(remoteDirectory, { recursive: true });
      const remoteEvent1 = createTestEvent();
      const remoteEvent2 = createTestEvent();
      await fs.writeFile(
        path.join(remoteDirectory, '1.jsonl'),
        `${serializeEventForTest(remoteEvent1)}\n${serializeEventForTest(remoteEvent2)}\n`,
        'utf8',
      );
      await fs.writeFile(
        path.join(remoteDirectory, 'manifest.json'),
        JSON.stringify({ sealed: ['1.jsonl'], lastEventId: remoteEvent2.eventId, watermarks: {} }),
        'utf8',
      );

      const localEvents = Array.from({ length: 6 }, () => createTestEvent());
      const ops = [
        store.appendEvents('graph1', localEvents.slice(0, 2)),
        store.reconcile('graph1'),
        store.appendEvents('graph1', localEvents.slice(2, 4)),
        store.reconcile('graph1'),
        store.appendEvents('graph1', localEvents.slice(4, 6)),
      ];

      const results = await Promise.all(ops);
      expect(results.every((result) => result.ok)).toBe(true);

      const stored = unwrap(await store.getEvents('graph1'));
      const ids = new Set(stored.map((event) => event.eventId));
      for (const localEvent of localEvents) {
        expect(ids.has(localEvent.eventId)).toBe(true);
      }
      expect(ids.has(remoteEvent1.eventId)).toBe(true);
      expect(ids.has(remoteEvent2.eventId)).toBe(true);
    });

    it('Journey 1: atomic multi-entity capture with open and shaped nodes/edges in one batch', async () => {
      const graphId = createGraphId();
      const session = createGraphSession(store, graphId, deviceId);
      await session.load();

      const openNodeId = createNodeId();
      const shapeId = asShapeId('shape:journey1:note');
      const shapedNodeId = createNodeId();
      const edgeId = createEdgeId();
      const now = createInstant();

      const commitResult = await session.commit([
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: shapeId as unknown as ReturnType<typeof createNodeId>,
          shapeId: SYSTEM_IDS.SHAPE,
          properties: new Map<string, string | boolean>([
            ['name', 'JourneyNote'],
            ['namespace', 'user'],
            ['entityKind', 'node'],
            ['closed', false],
          ]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: openNodeId,
          properties: new Map([['rawText', 'Unshaped clip']]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: shapedNodeId,
          shapeId,
          properties: new Map([['title', 'Structured note']]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'EdgeCreated',
          eventId: createEventId(),
          id: edgeId,
          source: openNodeId,
          target: shapedNodeId,
          properties: new Map(),
          timestamp: now,
          deviceId,
        },
      ]);

      expect(commitResult.ok).toBe(true);
      if (!commitResult.ok) return;
      expect(
        commitResult.value.events.every((event) => event.batchId === commitResult.value.batchId),
      ).toBe(true);

      const reloaded = createGraphSession(store, graphId, deviceId);
      await reloaded.load();
      expect(reloaded.graph().nodes.get(openNodeId)?.shape).toBeUndefined();
      expect(reloaded.graph().nodes.get(shapedNodeId)?.shape).toBe(shapeId);
      expect(reloaded.graph().edges.get(edgeId)?.shape).toBeUndefined();
    });

    it('Journey 2: immutable raw capture to derived lineage via derived-from and supersedes', async () => {
      const graphId = createGraphId();
      const session = createGraphSession(store, graphId, deviceId);
      await session.load();

      const rawId = createNodeId();
      const derivedShapeId = asShapeId('shape:journey2:derived-note');
      const derivedId = createNodeId();
      const derivedV2Id = createNodeId();
      const now = createInstant();

      const rawCommit = await session.commit([
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: rawId,
          properties: new Map([['body', 'Original raw capture']]),
          timestamp: now,
          deviceId,
        },
      ]);
      expect(rawCommit.ok).toBe(true);

      const lineageCommit = await session.commit([
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: derivedShapeId as unknown as ReturnType<typeof createNodeId>,
          shapeId: SYSTEM_IDS.SHAPE,
          properties: new Map<string, string | boolean>([
            ['name', 'DerivedNote'],
            ['namespace', 'user'],
            ['entityKind', 'node'],
            ['closed', false],
          ]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: derivedId,
          shapeId: derivedShapeId,
          properties: new Map([['title', 'Derived Note v1']]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'EdgeCreated',
          eventId: createEventId(),
          id: createEdgeId(),
          shapeId: SYSTEM_EDGE_SHAPES.DERIVED_FROM,
          source: derivedId,
          target: rawId,
          properties: new Map([['reason', 'extracted-note']]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: derivedV2Id,
          shapeId: derivedShapeId,
          properties: new Map([['title', 'Derived Note v2']]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'EdgeCreated',
          eventId: createEventId(),
          id: createEdgeId(),
          shapeId: SYSTEM_EDGE_SHAPES.SUPERSEDES,
          source: derivedV2Id,
          target: derivedId,
          properties: new Map([['reason', 'refined']]),
          timestamp: now,
          deviceId,
        },
      ]);
      expect(lineageCommit.ok).toBe(true);

      const reloaded = createGraphSession(store, graphId, deviceId);
      await reloaded.load();
      expect(reloaded.graph().nodes.get(rawId)?.properties.get('body')).toBe(
        'Original raw capture',
      );
      const readModel = createIndexedReadModel(reloaded.graph());
      expect(readModel.neighbours(derivedId, SYSTEM_EDGE_SHAPES.DERIVED_FROM, 'out')).toContain(
        rawId,
      );
      expect(readModel.neighbours(derivedV2Id, SYSTEM_EDGE_SHAPES.SUPERSEDES, 'out')).toContain(
        derivedId,
      );
    });

    it('Journey 3: external URLs via local proxy nodes, O(1) uri lookup, and enrichment', async () => {
      const graphId = createGraphId();
      const session = createGraphSession(store, graphId, deviceId);
      await session.load();

      const canonicalResult = canonicalizeUri(
        'https://en.wikipedia.org/wiki/Personal_knowledge_management#History',
      );
      expect(canonicalResult.ok).toBe(true);
      if (!canonicalResult.ok) return;
      const canonicalUri = canonicalResult.value;

      const sourceNodeId = createNodeId();
      const proxyNodeId = createNodeId();
      const now = createInstant();

      const initialCommit = await session.commit([
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: sourceNodeId,
          properties: new Map([['note', 'See PKM article']]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: proxyNodeId,
          shapeId: SYSTEM_IDS.PROXY,
          properties: new Map([['uri', canonicalUri]]),
          timestamp: now,
          deviceId,
        },
        {
          type: 'EdgeCreated',
          eventId: createEventId(),
          id: createEdgeId(),
          shapeId: SYSTEM_EDGE_SHAPES.REFERENCES,
          source: sourceNodeId,
          target: proxyNodeId,
          properties: new Map(),
          timestamp: now,
          deviceId,
        },
      ]);
      expect(initialCommit.ok).toBe(true);

      const readModel = createIndexedReadModel(session.graph());
      const matches = readModel.nodesWhereEquals('uri', canonicalUri, SYSTEM_IDS.PROXY);
      expect([...matches]).toEqual([proxyNodeId]);

      const enrichCommit = await session.commit([
        {
          type: 'NodePropertiesUpdated',
          eventId: createEventId(),
          id: proxyNodeId,
          changes: new Map([['title', 'Personal knowledge management - Wikipedia']]),
          timestamp: createInstant(),
          deviceId,
        },
      ]);
      expect(enrichCommit.ok).toBe(true);

      const reloaded = createGraphSession(store, graphId, deviceId);
      await reloaded.load();
      expect(reloaded.graph().nodes.get(proxyNodeId)?.properties.get('title')).toBe(
        'Personal knowledge management - Wikipedia',
      );
    });
  });
});
