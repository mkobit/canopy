/// <reference path="./interfaces/canopy-graph-content-rendering.d.ts" />
/// <reference path="./interfaces/canopy-graph-plugin-lifecycle.d.ts" />
/// <reference path="./interfaces/canopy-graph-plugin-manifest.d.ts" />
declare module 'canopy:graph/render-plugin' {
  export type * as CanopyGraphPluginManifest from 'canopy:graph/plugin-manifest'; // import canopy:graph/plugin-manifest
  export * as pluginLifecycle from 'canopy:graph/plugin-lifecycle'; // export canopy:graph/plugin-lifecycle
  export * as contentRendering from 'canopy:graph/content-rendering'; // export canopy:graph/content-rendering
}
