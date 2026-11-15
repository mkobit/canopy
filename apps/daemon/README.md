# `@canopy/daemon`

## Overview

The `@canopy/daemon` application provides the foreground `canopy-daemon` host process that loads a graph session over SQLite or in-memory storage and serves JSON-RPC 2.0 requests over a Unix domain socket.

## Subdirectories & Boundaries

- Source: [src](./src/README.md) — Daemon CLI entrypoint, configuration resolution, `node:fs` SQLite persistence adapter, and IPC server host lifecycle.
