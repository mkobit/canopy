## 1. Upgrade dependencies

- [x] 1.1 Update ESLint, Prettier, and plugin versions in [package.json](file:///home/mkobit/workspace/mkobit/canopy/package.json).
- [x] 1.2 Run `bun install` to update dependencies and regenerate the lockfile.
- [x] 1.3 Clear `tsc` build cache and `dist` folders across all packages and apps.

## 2. Resolve lint violations

- [x] 2.1 Run `eslint --fix` to automatically correct simple violations.
- [x] 2.2 Rebuild the project and run `eslint` to identify remaining violations.
- [x] 2.3 Manually fix all remaining `eslint` violations across the packages.
- [x] 2.4 Run typecheck, tests, and build checks to verify all quality gates pass.
