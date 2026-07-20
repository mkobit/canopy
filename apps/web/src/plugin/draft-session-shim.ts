import type { DraftSession, GraphEvent, Node, PropertyValue as TsPropertyValue } from '@canopy/graph';
import { asEventId, asNodeId, asTypeId, asInstant, asDeviceId } from '@canopy/graph';

// Mapping from WIT property value to TS property value
export function mapWitValueToTs(value: any): TsPropertyValue {
  if (value === null || value === undefined || typeof value !== 'object' || !('tag' in value)) {
    return null;
  }
  switch (value.tag) {
    case 'text':
    case 'date-time':
    case 'node-id':
      return value.val;
    case 'integer':
      return Number(value.val);
    case 'decimal':
      return value.val;
    case 'boolean':
      return value.val;
    case 'list-of-text':
      return value.val;
    case 'none':
    default:
      return null;
  }
}

// Mapping from TS property value to WIT property value
export function mapTsValueToWit(value: TsPropertyValue): any {
  if (value === null || value === undefined) {
    return { tag: 'none' };
  }
  if (typeof value === 'string') {
    return { tag: 'text', val: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { tag: 'integer', val: BigInt(value) };
    }
    return { tag: 'decimal', val: value };
  }
  if (typeof value === 'boolean') {
    return { tag: 'boolean', val: value };
  }
  if (Array.isArray(value)) {
    return { tag: 'list-of-text', val: value.filter((v): v is string => typeof v === 'string') };
  }
  return { tag: 'none' };
}

// Mapping from TS node to WIT GraphNode
export function mapTsNodeToWit(node: Node): any {
  const properties = [...node.properties.entries()].map(([name, value]) => ({
    name,
    value: mapTsValueToWit(value),
  }));
  return {
    id: node.id,
    nodeType: node.type,
    properties,
  };
}

// Mapping from WIT DraftEvent to TS GraphEvent
export function mapWitEventToTs(witEvent: any, defaultDeviceId: string): GraphEvent {
  const timestampStr = witEvent.val.timestamp || new Date().toISOString();
  const deviceIdStr = witEvent.val.deviceId || defaultDeviceId;
  const eventIdStr = witEvent.val.eventId || crypto.randomUUID();

  if (witEvent.tag === 'node-created') {
    const properties = new Map<string, TsPropertyValue>();
    if (witEvent.val.properties) {
      for (const entry of witEvent.val.properties) {
        properties.set(entry.name, mapWitValueToTs(entry.value));
      }
    }
    return {
      type: 'NodeCreated',
      eventId: asEventId(eventIdStr),
      id: asNodeId(witEvent.val.id),
      nodeType: asTypeId(witEvent.val.nodeType),
      properties,
      timestamp: asInstant(timestampStr),
      deviceId: asDeviceId(deviceIdStr),
      batchId: witEvent.val.batchId,
    };
  } else if (witEvent.tag === 'node-properties-updated') {
    const changes = new Map<string, TsPropertyValue>();
    if (witEvent.val.changes) {
      for (const entry of witEvent.val.changes) {
        changes.set(entry.name, mapWitValueToTs(entry.value));
      }
    }
    return {
      type: 'NodePropertiesUpdated',
      eventId: asEventId(eventIdStr),
      id: asNodeId(witEvent.val.id),
      changes,
      timestamp: asInstant(timestampStr),
      deviceId: asDeviceId(deviceIdStr),
      batchId: witEvent.val.batchId,
    };
  }
  throw new Error(`Unsupported WIT event tag: ${witEvent.tag}`);
}

export class DraftSessionHandle {
  private readonly draftSession: DraftSession;
  private readonly deviceId: string;

  constructor(draftSession: DraftSession, deviceId: string) {
    this.draftSession = draftSession;
    this.deviceId = deviceId;
  }

  public applyEvents(events: readonly any[]): void {
    const mappedEvents = events.map((e) => mapWitEventToTs(e, this.deviceId));
    const result = this.draftSession.applyEvents(mappedEvents);
    if (!result.ok) {
      throw new Error(result.error.type);
    }
  }

  public getParentRevision(): string {
    const result = this.draftSession.getParentRevision();
    if (!result.ok) {
      throw new Error(result.error.type);
    }
    return result.value;
  }

  public getNode(id: string): any {
    const result = this.draftSession.getNode(asNodeId(id));
    if (!result.ok) {
      throw new Error(result.error.type);
    }
    return mapTsNodeToWit(result.value);
  }

  public queryNodes(queryString: string): readonly any[] {
    const result = this.draftSession.queryNodes(queryString);
    if (!result.ok) {
      throw new Error(result.error.type);
    }
    return result.value.map((n) => mapTsNodeToWit(n));
  }

  public [Symbol.dispose](): void {
    this.draftSession.discard();
  }
}
