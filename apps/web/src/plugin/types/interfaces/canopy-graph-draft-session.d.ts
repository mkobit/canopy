/** @module Interface canopy:graph/draft-session **/
export type NodeId = string;
export type EventId = string;
export type TypeId = string;
export type PropertyValue = PropertyValueText | PropertyValueInteger | PropertyValueDecimal | PropertyValueBoolean | PropertyValueDateTime | PropertyValueNodeId | PropertyValueListOfText | PropertyValueNone;
export interface PropertyValueText {
  tag: 'text',
  val: string,
}
export interface PropertyValueInteger {
  tag: 'integer',
  val: bigint,
}
export interface PropertyValueDecimal {
  tag: 'decimal',
  val: number,
}
export interface PropertyValueBoolean {
  tag: 'boolean',
  val: boolean,
}
export interface PropertyValueDateTime {
  tag: 'date-time',
  val: string,
}
export interface PropertyValueNodeId {
  tag: 'node-id',
  val: string,
}
export interface PropertyValueListOfText {
  tag: 'list-of-text',
  val: Array<string>,
}
export interface PropertyValueNone {
  tag: 'none',
}
export interface PropertyEntry {
  name: string,
  value: PropertyValue,
}
export interface NodeCreatedEvent {
  eventId: EventId,
  id: NodeId,
  nodeType: TypeId,
  properties: Array<PropertyEntry>,
  timestamp: string,
  deviceId: string,
  batchId?: string,
}
export interface NodePropertiesUpdatedEvent {
  eventId: EventId,
  id: NodeId,
  changes: Array<PropertyEntry>,
  timestamp: string,
  deviceId: string,
  batchId?: string,
}
export type DraftEvent = DraftEventNodeCreated | DraftEventNodePropertiesUpdated;
export interface DraftEventNodeCreated {
  tag: 'node-created',
  val: NodeCreatedEvent,
}
export interface DraftEventNodePropertiesUpdated {
  tag: 'node-properties-updated',
  val: NodePropertiesUpdatedEvent,
}
export interface GraphNode {
  id: NodeId,
  nodeType: TypeId,
  properties: Array<PropertyEntry>,
}
/**
 * # Variants
 * 
 * ## `"parent-not-found"`
 * 
 * ## `"unauthorized"`
 * 
 * ## `"invalid-event-format"`
 * 
 * ## `"validation-failure"`
 * 
 * ## `"concurrent-modification"`
 * 
 * ## `"storage-error"`
 */
export type DraftError = 'parent-not-found' | 'unauthorized' | 'invalid-event-format' | 'validation-failure' | 'concurrent-modification' | 'storage-error';
/**
 * # Variants
 * 
 * ## `"invalid-query"`
 * 
 * ## `"node-not-found"`
 * 
 * ## `"access-denied"`
 */
export type QueryError = 'invalid-query' | 'node-not-found' | 'access-denied';

export class DraftSessionHandle {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  applyEvents(events: Array<DraftEvent>): void;
  getParentRevision(): string;
  getNode(id: NodeId): GraphNode;
  queryNodes(queryString: string): Array<GraphNode>;
}
