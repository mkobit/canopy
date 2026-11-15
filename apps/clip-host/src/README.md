# Clip host source

## Overview

This directory implements a Chrome native-messaging stdio proxy that decodes 4-byte length-prefixed JSON-RPC frames, enforces method allowlisting, sliding-window rate limiting, and `clip`/`WebClip` namespace narrowing, and relays validated requests to the Canopy daemon over a Unix domain socket.

## Interface

- `[allowlist.ts:AllowlistRejection]`, `[allowlist.ts:isAllowedMethod]`, `[allowlist.ts:needsNamespaceCheck]`, `[allowlist.ts:checkCreateNodeParameters]`, `[allowlist.ts:checkDraftApplyParameters]` Method allowlist and `WebClip` parameter checks.
- `[config.ts:resolveDaemonSocketPath]` Resolves the daemon Unix socket path from override, env, `XDG_RUNTIME_DIR`, or `~/.canopy/run/canopy.sock`.
- `[ensure-webclip-type.ts:CLIP_NAMESPACE]`, `[ensure-webclip-type.ts:WEBCLIP_TYPE_NAME]`, `[ensure-webclip-type.ts:EnsureWebClipTypeError]`, `[ensure-webclip-type.ts:toWireEvent]`, `[ensure-webclip-type.ts:EnsureWebClipTypeResult]`, `[ensure-webclip-type.ts:ensureWebClipType]` Idempotent `clip`/`WebClip` schema provisioning.
- `[framing.ts:MAX_FRAME_BYTES]`, `[framing.ts:NativeMessagingFramingError]`, `[framing.ts:encodeFrame]`, `[framing.ts:DecodedFrames]`, `[framing.ts:decodeFrames]` Chrome 4-byte little-endian length-prefixed JSON-RPC frame codec.
- `[host.ts:CLIP_HOST_ERROR_CODES]`, `[host.ts:IncomingRequest]`, `[host.ts:ClipHost]`, `[host.ts:ClipHostOptions]`, `[host.ts:createClipHost]` Stateful native-messaging request handler and daemon bridge.
- `[index.ts:runClipHost]` Stdio entrypoint reading `process.stdin` and writing framed responses to `process.stdout`.
- `[rate-limiter.ts:RateLimiter]`, `[rate-limiter.ts:RateLimiterOptions]`, `[rate-limiter.ts:createRateLimiter]` Sliding-window rate limiter.

## Invariants

- `[allowlist.ts:isAllowedMethod]` Allows only `IPC_METHODS.HANDSHAKE`, `DRAFT_CREATE`, `DRAFT_PREVIEW`, `DRAFT_COMMIT`, `DRAFT_DISCARD`, `QUERY_GET_NODES`, `MUTATION_CREATE_NODE`, and `DRAFT_APPLY`.
- `[allowlist.ts:checkCreateNodeParameters]` and `[allowlist.ts:checkDraftApplyParameters]` Require a defined `webClipTypeId` and restrict `MUTATION_CREATE_NODE` and single-event `DRAFT_APPLY` (`NodeCreated`) to `webClipTypeId`.
- `[framing.ts:MAX_FRAME_BYTES]` Enforces Chrome's 1 MiB (`1_048_576` bytes) cap on `encodeFrame` and `decodeFrames`; `decodeFrames` decodes atomically without mutating the input `Buffer`.
- `[host.ts:handleRequest]` Enforces ordered gates: method allowlist (`-32001`) -> rate limiter (`-32003`) -> lazy daemon connection (`-32004`) -> namespace check (`-32002`) -> Zod schema validation (`INVALID_PARAMS`) -> `IpcClient` dispatch; connection and `webClipTypeId` refs only cache successes.
- `[index.ts:runClipHost]` Resets the `stdin` accumulation buffer to empty on framing errors to recover alignment.
- `[rate-limiter.ts:createRateLimiter]` Allows at most `maxRequests` acquisitions per `windowMs`, recording `now` only on success.

## Side Effects

- `[config.ts:resolveDaemonSocketPath]` Reads `process.env` and `os.homedir()`.
- `[ensure-webclip-type.ts:ensureWebClipType]` Queries daemon nodes via `client.getNodes` and, when absent, mutates remote daemon graph state via `draftCreate`, `draftApply`, and `draftCommit`.
- `[host.ts:createClipHost]` Connects via `makeIpcClient` (mutating `session.connection` and `session.webClipTypeId` refs) and dispatches JSON-RPC requests.
- `[index.ts:runClipHost]` Registers a `process.stdin` `'data'` listener, writes framed JSON-RPC responses to `process.stdout`, and auto-runs at module load when `process.argv[1]` ends with `'index.ts'` or `'index.js'`.
- `[rate-limiter.ts:createRateLimiter]` Reads `Temporal.Now.instant().epochMilliseconds` and mutates the internal `timestamps` ref.

## Verification

- Run: `bun test`
