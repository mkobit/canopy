import type { Node, Edge, PropertyValue, GraphEvent } from '@canopy/types';
import type { StorableProperties, StorableNode, StorableEdge, StorableGraphEvent } from './types';
import { StorableNodeSchema, StorableEdgeSchema, StorableGraphEventSchema } from './types';

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

export const eventToStorable = (event: GraphEvent): StorableGraphEvent => {
  switch (event.type) {
    case 'NodeCreated': {
      return {
        ...event,
        properties: propertiesToStorable(event.properties),
      };
    }
    case 'NodePropertiesUpdated': {
      return {
        ...event,
        changes: propertiesToStorable(event.changes),
      };
    }
    case 'NodeDeleted': {
      return event;
    }
    case 'EdgeCreated': {
      return {
        ...event,
        properties: propertiesToStorable(event.properties),
      };
    }
    case 'EdgePropertiesUpdated': {
      return {
        ...event,
        changes: propertiesToStorable(event.changes),
      };
    }
    case 'EdgeDeleted': {
      return event;
    }
  }
};

export const storableToEvent = (storable: unknown): GraphEvent => {
  const e = StorableGraphEventSchema.parse(storable);
  switch (e.type) {
    case 'NodeCreated': {
      return {
        ...e,
        properties: storableToProperties(e.properties),
      };
    }
    case 'NodePropertiesUpdated': {
      return {
        ...e,
        changes: storableToProperties(e.changes),
      };
    }
    case 'NodeDeleted': {
      return e;
    }
    case 'EdgeCreated': {
      return {
        ...e,
        properties: storableToProperties(e.properties),
      };
    }
    case 'EdgePropertiesUpdated': {
      return {
        ...e,
        changes: storableToProperties(e.changes),
      };
    }
    case 'EdgeDeleted': {
      return e;
    }
  }
};
