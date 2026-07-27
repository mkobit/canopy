# Task 2 report: gRPC status code & result error mapping

**Status:** DONE
**Commit:** `a5c762a`

**Task:** Task 2 of Connect-Web and gRPC Protocol Adapter (`canopy-1dk.6`)

## Summary

Implemented gRPC status code enum definitions and result error mapping functions in `@canopy/api-adapter`.
The mapping translates domain error payloads (`ApiAdapterErrorPayload` and `ApiAdapterError`) to standard gRPC status codes (`GrpcStatusCode`) and constructs structured `ConnectRpcError` payloads.

## Key changes

- Created `packages/api-adapter/src/connect/grpc-errors.ts` implementing `GrpcStatusCode` enum, `mapResultErrorToGrpcStatusCode`, and `createConnectErrorPayload`.
- Standardized gRPC status codes covering `OK`, `INVALID_ARGUMENT`, `NOT_FOUND`, `ALREADY_EXISTS`, `ABORTED`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, and `INTERNAL`.
- Re-exported `GrpcStatusCode` cleanly across `@canopy/api-adapter` package entrypoints.
- Implemented comprehensive test suite in `packages/api-adapter/tests/connect-errors.test.ts`.

## Verification results

- Test suite: `bun test packages/api-adapter/tests/connect-errors.test.ts` (11 pass, 0 fail).
- Package quality gates: `bun run build`, `bun run lint`, `bun run typecheck`, and `bun test` passed cleanly.

## Concerns or follow-ups

None.
