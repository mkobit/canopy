export declare const instantBrand: unique symbol
export declare const plainDateBrand: unique symbol

/**
 * An absolute point in time, stored as ISO 8601 string.
 * Aligns with TC39 Temporal.Instant.
 * Example: "2024-01-15T10:30:00.000Z"
 */
export type Instant = string & Readonly<{ [instantBrand]: never }>

/**
 * A calendar date without time or timezone.
 * Aligns with TC39 Temporal.PlainDate.
 * Example: "2024-01-15"
 */
export type PlainDate = string & Readonly<{ [plainDateBrand]: never }>

/**
 * Temporal metadata attached to nodes and edges.
 */
export interface TemporalMetadata {
  readonly created: Instant
  readonly modified: Instant
}
