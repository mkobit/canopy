# `@canopy/storage-sqlite`

## Overview

The `@canopy/storage-sqlite` package implements `EventLogStore` over an in-memory `sql.js` SQLite database with optional async binary persistence via `SQLitePersistence`.

## Subdirectories & Boundaries

- Source: [src](./src/README.md) — `createSQLiteEventLog`, `SQLitePersistence` interface, and transactional SQLite `events` table persistence.
