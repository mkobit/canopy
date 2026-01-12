import type {
  ScalarValue,
  TextValue,
  NumberValue,
  BooleanValue,
  InstantValue,
  PlainDateValue,
  ReferenceValue,
  ExternalReferenceValue,
  PropertyValue,
  ListValue,
  Node,
  Edge,
} from '@canopy/types';

export function isTextValue(value: ScalarValue): value is TextValue {
  return value.kind === 'text';
}

export function isNumberValue(value: ScalarValue): value is NumberValue {
  return value.kind === 'number';
}

export function isBooleanValue(value: ScalarValue): value is BooleanValue {
  return value.kind === 'boolean';
}

export function isInstantValue(value: ScalarValue): value is InstantValue {
  return value.kind === 'instant';
}

export function isPlainDateValue(value: ScalarValue): value is PlainDateValue {
  return value.kind === 'plain-date';
}

export function isReferenceValue(value: ScalarValue): value is ReferenceValue {
  return value.kind === 'reference';
}

export function isExternalReferenceValue(value: ScalarValue): value is ExternalReferenceValue {
  return value.kind === 'external-reference';
}

export function isListValue(value: PropertyValue): value is ListValue {
  return value.kind === 'list';
}

export function isScalarValue(value: PropertyValue): value is ScalarValue {
  return value.kind !== 'list';
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
