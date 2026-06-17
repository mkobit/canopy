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
}

/**
 * Property value kinds for schema definition.
 */
export type PropertyValueKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'instant'
  | 'plain-date'
  | 'reference'
  | 'external-reference'
  | 'list';

/**
 * A collection of property values keyed by property name.
 */
export type PropertyMap = ReadonlyMap<string, PropertyValue>;
