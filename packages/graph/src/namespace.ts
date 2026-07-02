/**
 * Namespace `kind` values that the public type-authoring ops refuse to create
 * or write into. An open string (not a boolean) so a new restricted
 * classification is a one-line addition here, not a data migration.
 */
export const RESTRICTED_NAMESPACE_KINDS: ReadonlySet<string> = new Set(['system']);
