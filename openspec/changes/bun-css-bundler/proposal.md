## Why

Bun's native CSS bundler automatically encodes referenced font files as Base64 data URLs.
this increases the compiled stylesheet size in `apps/web` from 107 KB to 2.3 MB.
a 2.3 MB stylesheet block-renders the frontend application and hurts Largest Contentful Paint.
additionally, Tailwind CSS v4 lacks native watch integration in `Bun.build`, requiring a background Tailwind CLI compiler.
we investigate if we can resolve these blockers cleanly via custom Bun build plugins and whether migrating from Vite is viable.

## What Changes

- **Spike testing of Bun.build plugin**: write a custom Bun bundler plugin to handle PostCSS/Tailwind compilation, mark fonts as external, and copy font files.
- **Feasibility analysis**: evaluate the success metrics, build performance, developer experience, and cost-benefit trade-offs of the plugin setup.
- **Architectural decision**: define the final recommendation on whether to retain Vite or replace it with `Bun.build` in the OpenSpec design.

## Capabilities

### New Capabilities

- `bun-native-bundler-investigation`: research and document custom Bun plugins to resolve font inlining and Tailwind compilation in [proposal.md](file:///home/mkobit/workspace/mkobit/canopy/openspec/changes/bun-css-bundler/proposal.md).

### Modified Capabilities

(none)

## Impact

- `apps/web`: introduces temporary build scripts under `scratch/` to test compile pipelines and plugin configurations.
