import type { ScalarValue } from './scalars';

export declare const propertyKeyBrand: unique symbol;

/**
 * A strongly-typed property key.
 */
export type PropertyKey = string & Readonly<{ [propertyKeyBrand]: never }>;

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
export type PropertyValueKind = 'text' | 'number' | 'boolean' | 'instant' | 'reference' | 'list';

/**
 * A collection of property values keyed by property name.
 */
export type PropertyMap = ReadonlyMap<string, PropertyValue>;

/**
 * Represents changes to properties in an update event.
 */
export type PropertyChanges = Readonly<{
  /** Properties that were set or updated */
  set: ReadonlyMap<
    string,
    Readonly<{
      oldValue: PropertyValue | undefined;
      newValue: PropertyValue;
    }>
  >;

  /** Properties that were removed */
  removed: ReadonlyMap<
    string,
    Readonly<{
      oldValue: PropertyValue;
    }>
  >;
}>;
