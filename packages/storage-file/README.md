# `@canopy/storage-file`

## Overview

The `@canopy/storage-file` package implements a file-backed `EventLogStore` (`FileEventLog`) using segmented JSONL files, atomic `.tmp` + rename writes, and cross-device manifest reconciliation.

## Subdirectories & Boundaries

- Source: [src](./src/README.md) — `createFileEventLog`, remote manifest/segment helpers, and Zod-validated disk persistence.
