import type { ScalarValue, PropertyValue, Node, Edge, ExternalReferenceValue } from '@canopy/types';

export function isTextValue(value: ScalarValue): value is string {
  return typeof value === 'string';
}

export function isNumberValue(value: ScalarValue): value is number {
  return typeof value === 'number';
}

export function isBooleanValue(value: ScalarValue): value is boolean {
  return typeof value === 'boolean';
}

// Instant is string at runtime
export function isInstantValue(value: ScalarValue): value is string {
  return typeof value === 'string';
}

// PlainDate is string at runtime
export function isPlainDateValue(value: ScalarValue): value is string {
  return typeof value === 'string';
}

// Reference is string (NodeId) at runtime
export function isReferenceValue(value: ScalarValue): value is string {
  return typeof value === 'string';
}

export function isExternalReferenceValue(value: ScalarValue): value is ExternalReferenceValue {
  return typeof value === 'object' && value !== null && 'graph' in value && 'target' in value;
}

export function isListValue(value: PropertyValue): value is ScalarValue[] {
  return Array.isArray(value);
}

export function isScalarValue(value: PropertyValue): value is ScalarValue {
  return !Array.isArray(value);
}

export function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    'properties' in value &&
    'metadata' in value
  );
}

export function isEdge(value: unknown): value is Edge {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    'source' in value &&
    'target' in value &&
    'properties' in value &&
    'metadata' in value
  );
}
