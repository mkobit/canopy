# Applications

## Overview

This directory groups the runnable Canopy client, host, daemon, browser extension, and web applications.

## Subdirectories & Boundaries

- CLI: [cli](./cli/README.md) — `@canopy/cli` Effect CLI client connecting to the Canopy daemon over a Unix domain socket.
- Clip Host: [clip-host](./clip-host/README.md) — `@canopy/clip-host` Chrome native-messaging stdio proxy with allowlisting, rate limiting, and `WebClip` narrowing.
- Daemon: [daemon](./daemon/README.md) — `@canopy/daemon` foreground daemon process serving JSON-RPC 2.0 over a Unix socket backed by SQLite or in-memory storage.
- Extension: [extension](./extension/README.md) — `@canopy/extension` Manifest V3 browser extension for capturing and committing web clips.
- Web: [web](./web/README.md) — `@canopy/web` React SPA for graph exploration, editing, schema authoring, stored views, and WASM plugin rendering.
