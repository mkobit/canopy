import type { Node, Edge, PropertyValue } from '@canopy/types';
import type { StorableProperties, StorableNode, StorableEdge } from './types';
import { StorableNodeSchema, StorableEdgeSchema } from './types';

export const propertiesToStorable = (
  props: ReadonlyMap<string, PropertyValue>,
): StorableProperties => {
  return Object.fromEntries(props);
};

export const storableToProperties = (
  props: StorableProperties,
): ReadonlyMap<string, PropertyValue> => {
  return new Map(Object.entries(props));
};

export const nodeToStorable = (node: Node): StorableNode => {
  return {
    ...node,
    properties: propertiesToStorable(node.properties),
  };
};

export const storableToNode = (storable: unknown): Node => {
  // Validate that the stored object matches the expected schema
  const n = StorableNodeSchema.parse(storable);
  return {
    ...n,
    properties: storableToProperties(n.properties),
  };
};

export const edgeToStorable = (edge: Edge): StorableEdge => {
  return {
    ...edge,
    properties: propertiesToStorable(edge.properties),
  };
};

export const storableToEdge = (storable: unknown): Edge => {
  const e = StorableEdgeSchema.parse(storable);
  return {
    ...e,
    properties: storableToProperties(e.properties),
  };
};
