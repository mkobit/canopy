/**
 * Logical partition within a graph's identity space.
 * Namespace is determined by type definition, with optional per-node override.
 */
export type Namespace = 'system' | 'user' | 'imported' | 'user-settings';

/**
 * Namespace `kind` values that the public type-authoring ops refuse to create
 * or write into. An open string (not a boolean) so a new restricted
 * classification is a one-line addition here, not a data migration.
 */
export const RESTRICTED_NAMESPACE_KINDS: ReadonlySet<string> = new Set(['system']);
