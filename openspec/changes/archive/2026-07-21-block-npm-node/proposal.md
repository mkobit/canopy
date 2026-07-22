## Why

Developers should only use Bun for package management and script execution in this workspace.
Using npm or node directly bypasses Bun's lockfile, causing dependency drift and CI gate failures.

## What Changes

- Add a static validator script under `tools/` to check that all developer scripts and Git hooks do not contain commands starting with `npm` or `node` or `npx`.
- Update [.husky/pre-commit](file:///home/mkobit/workspace/mkobit/canopy/.husky/pre-commit) to use `bunx lint-staged` instead of `npx lint-staged`.
- Add a runtime `preinstall` blocker in [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json) that aborts `npm install` with a clear "use bun" warning.
- Integrate the static validator check into the `bun run lint` gate.

## Capabilities

### New Capabilities

- `npm-node-blocking`: Prevents execution of npm and node commands in developer scripts and hooks.

### Modified Capabilities

- None.

## Impact

- [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json): adds `preinstall` script and updates `lint` script.
- [.husky/pre-commit](file:///home/mkobit/workspace/mkobit/canopy/.husky/pre-commit): replaces `npx` with `bunx`.
- [tools/](file:///home/mkobit/workspace/mkobit/canopy/tools/): adds a new TypeScript check script.
