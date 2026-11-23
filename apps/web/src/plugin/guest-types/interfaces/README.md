# Guest type interfaces

## Overview

This directory contains TypeScript ambient module declarations (`.d.ts`) that define the guest-side `canopy:graph/*` WIT component-model interfaces for plugin lifecycle, manifests, draft sessions, content rendering, and wizard execution.

## Interface

- `[canopy-graph-content-rendering.d.ts:render]` `declare module 'canopy:graph/content-rendering'` exports `render(propertiesJson: string): RenderOutput`
- `[canopy-graph-content-rendering.d.ts:RenderOutput]` Exports `RenderOutput { html: string }`
- `[canopy-graph-draft-session.d.ts:NodeId]` `declare module 'canopy:graph/draft-session'` exports `NodeId = string`, `EventId = string`, `ShapeId = string`
- `[canopy-graph-draft-session.d.ts:PropertyValue]` Exports discriminated union `PropertyValue` (`PropertyValueText | PropertyValueInteger | PropertyValueDecimal | PropertyValueBoolean | PropertyValueDateTime | PropertyValueNodeId | PropertyValueListOfText | PropertyValueNone`) and `PropertyEntry`
- `[canopy-graph-draft-session.d.ts:DraftEvent]` Exports `NodeCreatedEvent`, `NodePropertiesUpdatedEvent`, and `DraftEvent` (`DraftEventNodeCreated | DraftEventNodePropertiesUpdated`)
- `[canopy-graph-draft-session.d.ts:GraphNode]` Exports `GraphNode`, `DraftError`, `QueryError`, and `DraftSessionHandle`
- `[canopy-graph-plugin-lifecycle.d.ts:getManifest]` `declare module 'canopy:graph/plugin-lifecycle'` exports `getManifest(): PluginManifest`, `initialize(): void`, `shutdown(): void`, and re-exports `PluginManifest`
- `[canopy-graph-plugin-manifest.d.ts:PluginManifest]` `declare module 'canopy:graph/plugin-manifest'` exports `MenuItem`, `CommandContribution`, and `PluginManifest`
- `[canopy-graph-wizard-execution.d.ts:WizardSession]` `declare module 'canopy:graph/wizard-execution'` exports `FieldKind`, `FieldDefinition`, `FormSchema`, `InputEntry`, `StepDestination` (`StepDestinationForm | StepDestinationComplete | StepDestinationCancel`), `StepResult`, `WizardSession`, and re-exports `DraftSessionHandle`, `DraftEvent`, `PropertyValue`

## Invariants

- `[canopy-graph-draft-session.d.ts:DraftSessionHandle]` `DraftSessionHandle` declares a `private constructor()` and implements `Disposable` (`[Symbol.dispose](): void`).
- `[canopy-graph-content-rendering.d.ts:RenderOutput]` Tier-1 `RenderOutput` carries a single static HTML string produced under `render:raw-html` capability and is sanitized by the host before mounting; future capabilities extend the record rather than changing `render()`.

## Side Effects

- None (ambient type declarations only).

## Verification

- Run: `bun test`
