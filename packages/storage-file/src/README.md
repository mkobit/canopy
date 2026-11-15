# File event log adapter

## Overview

This directory implements a file-backed `EventLogStore` (`FileEventLog`) that persists `GraphEvent` records as segmented JSONL files per device under `<rootDir>/events/<deviceId>/` with atomic `.tmp` + rename writes and cross-device manifest reconciliation.

## Interface

- `[index.ts:*]` and `[file-event-log.ts:*]` Export `createFileEventLog`, `scanRemoteManifests`, `getRemoteSegmentsInOrder`, `readRemoteSegmentEvents`, `FileEventLog`, `FileEventLogConfig`, and `FileStoreManifest`.

## Invariants

- `[file-event-log.ts:createFileEventLog]` Requires `init()` before `appendEvents`, `getEvents`, or `reconcile` (`init()` is idempotent); enforces a single `graphId` per store (`'Graph ID mismatch: ...'` otherwise).
- `[file-event-log.ts:createStorageConfig]` Defaults segment rotation limits to `maxEventsPerSegment = 1000` and `maxBytesPerSegment = 1048576` (1 MiB); consecutive events sharing a `batchId` are never split across segments.
- `[file-event-log.ts:executeAppendEvents]` and `[file-event-log.ts:readAllEventsFromDisk]` Deduplicate by `eventId`, sort ascending by `eventId.localeCompare`, and validate `canopy.json`, `manifest.json`, and `GraphEvent` records with Zod schemas.
- `[file-event-log.ts:scanRemoteManifests]` Excludes `localDeviceId`, returns an empty `Map` on `ENOENT`, and skips unreadable/invalid remote `manifest.json` files.

## Side Effects

- `[file-event-log.ts:initializeStoreDirectory]` Creates `<rootDir>/events/<deviceId>` via `fs.mkdir(..., { recursive: true })`.
- `[file-event-log.ts:writeAtomically]` Atomically writes `<rootDir>/canopy.json`, JSONL segment files (`<firstEvent.eventId>.jsonl`), and `<rootDir>/events/<deviceId>/manifest.json` via `<path>.tmp` + `fs.rename`.
- Reads files/directories via `fs.readFile` and `fs.readdir` and mutates closure state (`initializedGraphId`, `isInitialized`, `cacheLoaded`, `knownEventIds`).

## Verification

- Run: `bun test`
