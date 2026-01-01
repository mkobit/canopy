import type { PropertyMap, PropertyValue } from '@canopy/types';

/**
 * Creates a PropertyMap from a plain object.
 */
export function createPropertyMap(properties: Record<string, PropertyValue>): PropertyMap {
  return new Map(Object.entries(properties));
}

/**
 * Converts a PropertyMap to a plain object.
 */
export function propertyMapToObject(map: PropertyMap): Record<string, PropertyValue> {
  return Object.fromEntries(map);
}

/**
 * Safely gets a property value from a map.
 */
export function getProperty(map: PropertyMap, key: string): PropertyValue | undefined {
  return map.get(key);
}

/**
 * Returns an empty PropertyMap.
 */
export function emptyPropertyMap(): PropertyMap {
  return new Map();
}
