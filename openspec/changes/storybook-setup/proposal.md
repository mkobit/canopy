## Why

Canopy currently lacks an isolated visual testing and component preview environment for graph and layout UI components in `apps/web`.
Developing and verifying UI components like custom graph nodes, custom edges, and graph canvas views currently requires running the entire web application.
Adding Storybook to `apps/web` provides isolated component development, rapid visual feedback, and a foundation for visual regression testing.

## What changes

- **Storybook configuration in `apps/web`**: Add Storybook 8 with `@storybook/react-vite` and `@storybook/addon-essentials` to `apps/web`.
- **Global styling integration**: Load Tailwind CSS v4 styles (`src/index.css`) and Google Fonts (`@fontsource/*`) in `.storybook/preview.tsx`.
- **Co-located stories**: Add stories for core Graph canvas and node components (`custom-node.stories.tsx`, `custom-edge.stories.tsx`, `graph-canvas.stories.tsx`).
- **Workspace scripts**: Add `"storybook"` and `"build-storybook"` scripts to `apps/web/package.json` and a workspace root script (`"storybook"`).

## Capabilities

### New capabilities

- `storybook-visual-testing`: Enables isolated visual component rendering and previewing in `apps/web` via `bun run storybook`.

### Modified capabilities

<!-- None -->

## Impact

- `apps/web`: Adds `.storybook/` configuration directory, co-located component stories under `src/components/graph/`, and Storybook dependencies/scripts.
- `package.json`: Adds root `"storybook"` script forwarding to `apps/web`.
