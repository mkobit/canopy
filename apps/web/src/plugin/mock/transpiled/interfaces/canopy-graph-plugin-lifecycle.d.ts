/** @module Interface canopy:graph/plugin-lifecycle **/
export function getManifest(): PluginManifest;
export function initialize(): void;
export function shutdown(): void;
export type PluginManifest = import('./canopy-graph-plugin-manifest.js').PluginManifest;
