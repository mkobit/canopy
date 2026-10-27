## Why

The native-messaging host has 16 ESLint directives in four files at base `0cad57cb67e77a6f5a4904b613496f7f02363609`.
This design for canopy-v9o.1.25 proposes a minimal rewrite that preserves current runtime and wire behavior, with one narrow internal return-type change.
Independent adversarial review and maintainer approval are pending.

## What changes

- Replace local mutable accumulation with explicit immutable transitions.
- Preserve synchronous rate checks, framing results, lazy successful state reuse, and independent request dispatch.
- Remove all 16 directives, and let app-internal `runClipHost` return the existing `stdin.on` registration result with its inferred third-party type.
- Retain all other limiter, framing, and host public signatures.
- Withhold `tasks.md`, implementation packet staging, implementation Beads, and implementation until independent review and merged design approval.

## Capabilities

### New capabilities

- `clip-host-functional-rewrite`: behavior and acceptance constraints for the host rewrite.

### Modified capabilities

None.

## Impact

Future implementation is limited to the four host source files and focused acceptance evidence.
No new dependency, network listener, permission, method, runtime schema, kernel type, or storage path is proposed.
The [current capture contract](../../specs/web-clip-capture/spec.md) and [delivery contract](../agent-delivery-boundaries/specs/bounded-agent-delivery/spec.md) remain authoritative.
