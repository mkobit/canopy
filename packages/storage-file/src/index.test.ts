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
import { createFileEventLog } from './file-event-log';
import type { FileEventLog } from './file-event-log';

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
});
