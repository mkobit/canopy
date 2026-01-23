export declare const instantBrand: unique symbol;

/**
 * An absolute point in time, stored as milliseconds since the epoch.
 * Aligns with TC39 Temporal.Instant (as epochMilliseconds).
 */
export type Instant = number & Readonly<{ [instantBrand]: never }>;

/**
 * Temporal metadata attached to nodes and edges.
 */
export interface TemporalMetadata {
  readonly created: Instant;
  readonly modified: Instant;
}
