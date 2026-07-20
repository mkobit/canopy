/// <reference path="./interfaces/canopy-graph-draft-session.d.ts" />
/// <reference path="./interfaces/canopy-graph-plugin-lifecycle.d.ts" />
/// <reference path="./interfaces/canopy-graph-plugin-manifest.d.ts" />
/// <reference path="./interfaces/canopy-graph-wizard-execution.d.ts" />
declare module 'canopy:graph/plugin' {
  export type * as CanopyGraphDraftSession from 'canopy:graph/draft-session'; // import canopy:graph/draft-session
  export type * as CanopyGraphPluginManifest from 'canopy:graph/plugin-manifest'; // import canopy:graph/plugin-manifest
  export * as pluginLifecycle from 'canopy:graph/plugin-lifecycle'; // export canopy:graph/plugin-lifecycle
  export * as wizardExecution from 'canopy:graph/wizard-execution'; // export canopy:graph/wizard-execution
}
