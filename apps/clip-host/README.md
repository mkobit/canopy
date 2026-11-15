# `@canopy/clip-host`

## Overview

The `@canopy/clip-host` application implements the Chrome native-messaging stdio host that validates and relays browser extension web-clipper JSON-RPC requests to the Canopy daemon.

## Subdirectories & Boundaries

- Source: [src](./src/README.md) — 4-byte length-prefixed framing codec, method allowlisting, sliding-window rate limiter, `clip`/`WebClip` schema provisioning, and daemon socket relay.
