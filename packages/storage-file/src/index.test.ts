import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  unwrap,
  createEventId,
  createNodeId,
  asTypeId,
  asDeviceId,
  createInstant,
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
    properties: Object.fromEntries(event.properties),
  });
};

describe('FileEventLog', () => {
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');
  const timestamp = createInstant();

  const createTestEvent = (): GraphEvent => ({
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    nodeType: asTypeId('test-node'),
    properties: new Map(),
    timestamp,
    deviceId,
  });

  let tempDir: string;
  let store: FileEventLog;

  beforeEach(async () => {
    tempDir = path.join(__dirname, `../dist/test-temp-${Math.random()}`);
    await fs.mkdir(tempDir, { recursive: true });
    store = createFileEventLog({
      rootDir: tempDir,
      deviceId: 'device-1',
      maxEventsPerSegment: 3,
      maxBytesPerSegment: 1024,
    });
    await unwrap(await store.init());
  });

  afterEach(async () => {
    await unwrap(await store.close());
    await fs.rm(tempDir, { recursive: true, force: true });
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

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { after: event1.eventId }));
    expect(result).toEqual([event2, event3]);
  });

  it('filters events using the "before" option', async () => {
    const sortedEvents = [createTestEvent(), createTestEvent(), createTestEvent()].toSorted(
      (a, b) => a.eventId.localeCompare(b.eventId),
    );
    const [event1, event2, event3] = sortedEvents;

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { before: event3.eventId }));
    expect(result).toEqual([event1, event2]);
  });

  it('limits the number of returned events using the "limit" option', async () => {
    const sortedEvents = [createTestEvent(), createTestEvent(), createTestEvent()].toSorted(
      (a, b) => a.eventId.localeCompare(b.eventId),
    );
    const [event1, event2] = sortedEvents;

    await store.appendEvents('graph1', sortedEvents);

    const result = unwrap(await store.getEvents('graph1', { limit: 2 }));
    expect(result).toEqual([event1, event2]);
  });

  it('reverses the returned events using the "reverse" option', async () => {
    const sortedEvents = [createTestEvent(), createTestEvent(), createTestEvent()].toSorted(
      (a, b) => a.eventId.localeCompare(b.eventId),
    );
    const [event1, event2, event3] = sortedEvents;

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
      path.join(tempDir, 'events/device-1/manifest.json'),
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
      rootDir: tempDir,
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
      rootDir: tempDir,
      deviceId: 'device-1',
      maxEventsPerSegment: 2,
      maxBytesPerSegment: 1024,
    });
    await unwrap(await batchStore.init());

    const batchId = 'batch-1';
    const event1 = { ...createTestEvent(), batchId };
    const event2 = { ...createTestEvent(), batchId };
    const event3 = { ...createTestEvent(), batchId };

    await batchStore.appendEvents('graph1', [event1, event2, event3]);

    const manifestContent = await fs.readFile(
      path.join(tempDir, 'events/device-1/manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestContent);

    expect(manifest.sealed).toHaveLength(1);
    expect(manifest.lastEventId).toBe(event3.eventId);

    const segmentFile = manifest.sealed[0];
    const segmentContent = await fs.readFile(
      path.join(tempDir, 'events/device-1', segmentFile),
      'utf8',
    );
    const lines = segmentContent.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(3);

    await unwrap(await batchStore.close());
  });

  it('seals segments correctly based on maxBytesPerSegment', async () => {
    const byteStore = createFileEventLog({
      rootDir: tempDir,
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
      path.join(tempDir, 'events/device-1/manifest.json'),
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
    const deviceDir = path.join(tempDir, 'events/device-1');
    await fs.mkdir(deviceDir, { recursive: true });
    const initialManifest = {
      sealed: [],
      lastEventId: null,
      watermarks: {
        'remote-device-1': 'event-123',
      },
    };
    await fs.writeFile(
      path.join(deviceDir, 'manifest.json'),
      JSON.stringify(initialManifest, null, 2),
      'utf8',
    );

    const watermarkStore = createFileEventLog({
      rootDir: tempDir,
      deviceId: 'device-1',
      maxEventsPerSegment: 10,
      maxBytesPerSegment: 1024,
    });
    await unwrap(await watermarkStore.init());

    const event = createTestEvent();
    await watermarkStore.appendEvents('graph1', [event]);

    const manifestContent = await fs.readFile(path.join(deviceDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestContent);
    expect(manifest.watermarks).toEqual({
      'remote-device-1': 'event-123',
    });

    await unwrap(await watermarkStore.close());
  });

  describe('remote device helpers', () => {
    it('scanRemoteManifests returns empty map if events dir does not exist', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      const result = unwrap(await scanRemoteManifests(nonExistentDir, 'device-1'));
      expect(result.size).toBe(0);
    });

    it('scanRemoteManifests scans manifests and ignores local device', async () => {
      const eventsDir = path.join(tempDir, 'events');
      await fs.mkdir(path.join(eventsDir, 'device-1'), { recursive: true });
      await fs.mkdir(path.join(eventsDir, 'device-2'), { recursive: true });
      await fs.mkdir(path.join(eventsDir, 'device-3'), { recursive: true });

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
        path.join(eventsDir, 'device-2', 'manifest.json'),
        JSON.stringify(manifest2),
        'utf8',
      );
      await fs.writeFile(
        path.join(eventsDir, 'device-3', 'manifest.json'),
        JSON.stringify(manifest3),
        'utf8',
      );

      const result = unwrap(await scanRemoteManifests(tempDir, 'device-1'));
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
      const remoteDeviceDir = path.join(tempDir, 'events/device-2');
      const missingDirResult = unwrap(await getRemoteSegmentsInOrder(remoteDeviceDir));
      expect(missingDirResult).toEqual([]);

      await fs.mkdir(remoteDeviceDir, { recursive: true });
      await fs.writeFile(path.join(remoteDeviceDir, 'b.jsonl'), 'data');
      await fs.writeFile(path.join(remoteDeviceDir, 'a.jsonl'), 'data');
      await fs.writeFile(path.join(remoteDeviceDir, 'other.txt'), 'data');

      const result = unwrap(await getRemoteSegmentsInOrder(remoteDeviceDir));
      expect(result).toEqual(['a.jsonl', 'b.jsonl']);
    });

    it('readRemoteSegmentEvents reads and deserializes events correctly', async () => {
      const remoteDeviceDir = path.join(tempDir, 'events/device-2');
      await fs.mkdir(remoteDeviceDir, { recursive: true });

      const event1 = createTestEvent();
      const event2 = createTestEvent();

      const content = `${serializeEventForTest(event1)}\n${serializeEventForTest(event2)}\n`;
      await fs.writeFile(path.join(remoteDeviceDir, 'a.jsonl'), content, 'utf8');

      const result = unwrap(await readRemoteSegmentEvents(remoteDeviceDir, 'a.jsonl'));
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
      const remoteDeviceDir = path.join(tempDir, 'events', remoteDeviceId);
      await fs.mkdir(remoteDeviceDir, { recursive: true });

      const event1 = { ...createTestEvent(), deviceId: remoteDeviceId };
      const event2 = { ...createTestEvent(), deviceId: remoteDeviceId };

      const content = `${serializeEventForTest(event1)}\n${serializeEventForTest(event2)}\n`;
      await fs.writeFile(path.join(remoteDeviceDir, '1.jsonl'), content, 'utf8');

      const remoteManifest = {
        sealed: ['1.jsonl'],
        lastEventId: event2.eventId,
        watermarks: {},
      };
      await fs.writeFile(
        path.join(remoteDeviceDir, 'manifest.json'),
        JSON.stringify(remoteManifest),
        'utf8',
      );

      unwrap(await store.reconcile('graph1'));

      const localEvents = unwrap(await store.getEvents('graph1'));
      expect(localEvents).toHaveLength(2);
      expect(localEvents.map((e) => e.eventId)).toContain(event1.eventId);
      expect(localEvents.map((e) => e.eventId)).toContain(event2.eventId);

      const manifestContent = await fs.readFile(
        path.join(tempDir, 'events/device-1/manifest.json'),
        'utf8',
      );
      const localManifest = JSON.parse(manifestContent);
      expect(localManifest.watermarks[remoteDeviceId as string]).toBe(event2.eventId);
    });

    it('only ingests new remote events beyond the watermark', async () => {
      const remoteDeviceId = asDeviceId('00000000-0000-4000-8000-000000000002');
      const remoteDeviceDir = path.join(tempDir, 'events', remoteDeviceId);
      await fs.mkdir(remoteDeviceDir, { recursive: true });

      const sortedEvents = [
        { ...createTestEvent(), deviceId: remoteDeviceId },
        { ...createTestEvent(), deviceId: remoteDeviceId },
        { ...createTestEvent(), deviceId: remoteDeviceId },
      ].toSorted((a, b) => a.eventId.localeCompare(b.eventId));

      const [event1, event2, event3] = sortedEvents;

      const initialLocalManifest = {
        sealed: [],
        lastEventId: null,
        watermarks: {
          [remoteDeviceId as string]: event1.eventId,
        },
      };
      await fs.writeFile(
        path.join(tempDir, 'events/device-1/manifest.json'),
        JSON.stringify(initialLocalManifest),
        'utf8',
      );

      await fs.writeFile(
        path.join(remoteDeviceDir, '1.jsonl'),
        serializeEventForTest(event1) + '\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(remoteDeviceDir, '2.jsonl'),
        `${serializeEventForTest(event2)}\n${serializeEventForTest(event3)}\n`,
        'utf8',
      );

      const remoteManifest = {
        sealed: ['1.jsonl', '2.jsonl'],
        lastEventId: event3.eventId,
        watermarks: {},
      };
      await fs.writeFile(
        path.join(remoteDeviceDir, 'manifest.json'),
        JSON.stringify(remoteManifest),
        'utf8',
      );

      unwrap(await store.reconcile('graph1'));

      const localEvents = unwrap(await store.getEvents('graph1'));
      expect(localEvents).toHaveLength(2);
      expect(localEvents.map((e) => e.eventId)).not.toContain(event1.eventId);
      expect(localEvents.map((e) => e.eventId)).toContain(event2.eventId);
      expect(localEvents.map((e) => e.eventId)).toContain(event3.eventId);

      const manifestContent = await fs.readFile(
        path.join(tempDir, 'events/device-1/manifest.json'),
        'utf8',
      );
      const localManifest = JSON.parse(manifestContent);
      expect(localManifest.watermarks[remoteDeviceId as string]).toBe(event3.eventId);
    });
  });
});
