import type { ScalarValue } from './scalars';

/**
 * A property value is either a scalar or a flat list of scalars.
 * No nesting—lists cannot contain other lists.
 */
export type PropertyValue = ScalarValue | readonly ScalarValue[];

/**
 * Schema definition for a property on a node or edge type.
 */
export interface PropertyDefinition {
  readonly name: string;
  readonly valueKind: PropertyValueKind;
  readonly required: boolean;
  readonly description: string | undefined;
  readonly regex?: string | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly choices?: readonly string[] | undefined;
}

/**
 * All valid property value kinds, single source of truth for `PropertyValueKind`.
 */
export const PROPERTY_VALUE_KINDS = [
  'text',
  'number',
  'boolean',
  'instant',
  'plain-date',
  'reference',
  'external-reference',
  'list',
] as const;

/**
 * Property value kinds for schema definition.
 */
export type PropertyValueKind = (typeof PROPERTY_VALUE_KINDS)[number];

/**
 * A collection of property values keyed by property name.
 */
export type PropertyMap = ReadonlyMap<string, PropertyValue>;
