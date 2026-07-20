## 1. Create storage-http package

- [x] 1.1 Create the `@canopy/storage-http` package directory and initialize `package.json` with appropriate workspace dependencies.
- [x] 1.2 Set up typescript configuration files (`tsconfig.json`, `tsconfig.build.json`, `tsconfig.check.json`).
- [x] 1.3 Create `packages/storage-http/AGENTS.md` following the documentation styling rules.

## 2. Implement HTTP event log

- [x] 2.1 Implement `serializeEvent` and `deserializeEvent` helpers to convert `Map` instances in event payloads.
- [x] 2.2 Implement `createHTTPEventLog` using standard `fetch` API.
- [x] 2.3 Ensure error scenarios (e.g., non-2xx responses, network failures) return `Result` error values rather than throwing exceptions.
- [x] 2.4 Export public interfaces and functions from `index.ts`.

## 3. Implement tests and verify

- [x] 3.1 Write unit tests in `packages/storage-http/src/http-event-log.test.ts` to test event appending and query options with a mock fetch.
- [x] 3.2 Add the package to the root workspace list in `package.json` if necessary, and run `bun install`.
- [x] 3.3 Ensure the build and test suites pass successfully.
