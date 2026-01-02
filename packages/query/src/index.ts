export * from './model.js';
export * from './builder.js';
export * from './engine.js';

// Re-export old GraphQuery for now, or just leave it if it's not being replaced yet.
// But to avoid confusion, I'll keep the new API clean.
// The task "Implement query execution engine" implies replacing or providing the main implementation.
// If I remove GraphQuery, I might break existing code. But I verified 'packages/query/src' only had 'index.ts' with 'GraphQuery'.
// I should check if 'GraphQuery' is used elsewhere.
// Since this is a new feature request task, I'll export the new stuff.
// If I need to support GraphQuery, I should keep it or rewrite it using the new engine.
// For now, I will keep GraphQuery in a separate file if I need to preserve it, but I overwrote index.ts.
// Let's bring back GraphQuery if needed, but the prompt didn't say "Refactor".
// "Implement query execution engine... This enables...".
// The existing GraphQuery was very basic.
// I'll re-export it if I can finding usages, but I can't grep effectively without `grep`.
// I'll assume I can replace it or just export the new stuff alongside.
// Wait, I am overwriting index.ts.
// I will just export everything.

export { GraphQuery } from './legacy.js';
