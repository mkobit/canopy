# SQLite event log adapter

## Overview

This directory implements `EventLogStore` over an in-memory `sql.js` SQLite database with optional async binary persistence via `SQLitePersistence`. It serializes `GraphEvent` payloads as JSON in an `events` table keyed by `(graph_id, event_id)`.

## Interface

- `[index.ts:*]` Re-exports `createSQLiteEventLog`, `SQLiteEventLog`, and `SQLitePersistence` from `./sqlite-event-log`.
- `[sqlite-event-log.ts:SQLitePersistence]` Interface with `readonly read: () => Promise<Uint8Array | null>` and `readonly write: (data: Uint8Array) => Promise<void>`.
- `[sqlite-event-log.ts:SQLiteEventLog]` Interface extending `EventLogStore` with `readonly init` and `readonly close`.
- `[sqlite-event-log.ts:createSQLiteEventLog]` `(persistence?: SQLitePersistence) => SQLiteEventLog`.

## Invariants

- `[sqlite-event-log.ts:initSchema]` `events` table enforces `PRIMARY KEY (graph_id, event_id)` and `NOT NULL` on `graph_id`, `event_id`, `timestamp`, `type`, and `payload`.
- `[sqlite-event-log.ts:createSQLiteEventLog]` `init()` is idempotent; `appendEvents` and `getEvents` return `err(new Error('Database not initialized'))` when `database` is `null`.
- `[sqlite-event-log.ts:executeAppendEvents]` Uses `INSERT OR IGNORE INTO events` inside `BEGIN TRANSACTION` / `COMMIT`, rolling back on failure.
- `[sqlite-event-log.ts:serializeEvent]` and `[sqlite-event-log.ts:deserializeEvent]` Convert `properties`/`changes` `Map`s to/from JSON objects (`deserializeEvent` delegates to `decodeStoredEvent` for read-side upcasting and `null` retired meta-shape filtering); `[sqlite-event-log.ts:buildSelectQuery]` filters by `graph_id`, optional `after`/`before`, orders by `event_id` ASC/DESC, and applies optional `LIMIT`; `[sqlite-event-log.ts:executeGetEvents]` returns the first decode error or filters out `null` events.

## Side Effects

- `[sqlite-event-log.ts:createSQLiteEventLog]` `init` calls `initSqlJs()`, invokes `persistence.read()`, instantiates `SQL.Database`, and runs `initSchema`; `close` closes the database and clears the reference; `appendEvents` mutates the SQLite `events` table and calls `database.export()` + `persistence.write(data)`; `getEvents` runs `SELECT` via `databaseInstance.exec`.

## Verification

- Run: `bun test`
