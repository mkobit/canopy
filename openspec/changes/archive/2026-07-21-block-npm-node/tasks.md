## 1. Blocker and Hooks Implementation

- [x] 1.1 Update [.husky/pre-commit](file:///home/mkobit/workspace/mkobit/canopy/.husky/pre-commit) to use `bunx lint-staged` instead of `npx` to prevent self-blocking.
- [x] 1.2 Add the runtime blocker to the root [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json) via a `preinstall` hook.
- [x] 1.3 Create [tools/check-commands.ts](file:///home/mkobit/workspace/mkobit/canopy/tools/check-commands.ts) to statically validate workspace scripts and hooks.
- [x] 1.4 Update the root [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json) `"lint"` script to execute [tools/check-commands.ts](file:///home/mkobit/workspace/mkobit/canopy/tools/check-commands.ts).

## 2. Verification and Quality Gates

- [x] 2.1 Run `bun run lint` to execute the static checks across the workspace.
- [x] 2.2 Verify that `npm install` triggers the runtime blocker and exits with code 1.
- [x] 2.3 Execute all validation gates (`bun run build`, `bun run typecheck`, and `bun run test`) to ensure clean execution.
