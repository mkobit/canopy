## Why

The dependency versions of ESLint, Prettier, and their plugins in the repository are outdated.
Upgrading them aligns the project with up-to-date tool configurations and resolves latent linting violations.

## What changes

- Bump linting and formatting dependencies in the root [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json).
- Fix all newly-surfaced linting and formatting violations across the repository.
- Adjust the ESLint configuration for any rule changes introduced by the newer plugin versions.

## Capabilities

### New capabilities

None.

### Modified capabilities

- `eslint-functional-enforcement`: Resolve new linting violations surfaced by upgrading `eslint-plugin-functional` to version 10.

## Impact

- The root [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json) and [bun.lock](file:///home/mkobit/workspace/mkobit/canopy/bun.lock) files will be updated.
- Various TypeScript files across `packages/` and `apps/web/` will be modified to resolve lint errors.
- The ESLint flat configuration file [eslint.config.mjs](file:///home/mkobit/workspace/mkobit/canopy/eslint.config.mjs) will be adjusted.
