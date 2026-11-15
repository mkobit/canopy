# Extension source

## Overview

This directory groups the Manifest V3 browser extension source subsystems: the background service worker, injected content script, popup UI, and shared message/RPC contracts.

## Subdirectories & Boundaries

- Background: [background](./background/README.md) — MV3 service worker bridging popup requests to the native-messaging RPC host and managing draft state.
- Content: [content](./content/README.md) — Anonymous IIFE content script extracting page title, URL, selection, and body text.
- Popup: [popup](./popup/README.md) — Runtime-validated popup DOM bindings and capture/preview/commit/discard UI controller.
- Shared: [shared](./shared/README.md) — Extension constants, message unions, UTF-8 clip payload validation, and JSON-RPC 2.0 native-messaging client.
