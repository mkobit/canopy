# sandboxed-iframe-rendering Specification

## Purpose
TBD - created by archiving change tier2-sandboxed-render-engine. Update Purpose after archive.
## Requirements
### Requirement: Opaque-origin isolation boundary

The system SHALL render untrusted interactive plugin output inside a `srcdoc` iframe configured with `sandbox="allow-scripts"`, with `allow-same-origin` omitted, and with an empty Permissions-Policy (`allow=""`), so the frame runs on an opaque null origin that cannot reach the host origin, its storage, or its DOM, and cannot inherit host-delegated features.

#### Scenario: Frame runs on an opaque origin

- **WHEN** the host mounts a Tier-2 render frame
- **THEN** the iframe SHALL be a `srcdoc` frame with `sandbox="allow-scripts"`
- **AND** `allow-same-origin` SHALL NOT be present in the sandbox token list
- **AND** the sandbox token list SHALL NOT include `allow-forms`, `allow-modals`, `allow-popups`, or `allow-top-navigation`

#### Scenario: Delegated permissions are denied

- **WHEN** the host mounts a Tier-2 render frame
- **THEN** the iframe `allow` attribute SHALL be empty (`allow=""`), denying camera, microphone, geolocation, clipboard, fullscreen, pointer-lock, and other Permissions-Policy-gated features
- **AND** a guard SHALL assert the `allow` attribute is empty, paralleling the assertion that `allow-same-origin` is absent

#### Scenario: Frame cannot escape its own sandbox

- **WHEN** plugin output attempts to remove the frame's `sandbox` attribute or reach the parent origin
- **THEN** the opaque origin SHALL prevent same-origin DOM access to the host
- **AND** the host SHALL NOT grant the frame any capability that would let it re-enable same-origin access

### Requirement: In-document content security policy

The system SHALL deliver the frame's content security policy via a `<meta http-equiv="Content-Security-Policy">` tag inside the srcdoc document, because a srcdoc frame otherwise inherits the parent policy, and the policy SHALL pin the full restrictive directive set rather than relying on `default-src` fallback for directives that have none.

#### Scenario: CSP is delivered inside the srcdoc with the full directive set

- **WHEN** the host builds a Tier-2 frame document
- **THEN** the document SHALL contain a meta CSP with `default-src 'none'`
- **AND** the policy SHALL set `connect-src 'none'`, `object-src 'none'`, `frame-src 'none'`, `worker-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and `frame-ancestors 'none'` (the last two having no `default-src` fallback)

#### Scenario: Script and WASM execution are permitted

- **WHEN** interactive output executes inside the frame
- **THEN** the CSP SHALL permit inline script and `wasm-unsafe-eval` for the frame's own logic

### Requirement: Network exfiltration is bounded by data minimization, not fully closed

The system SHALL NOT rely on CSP to fully prevent a Tier-2 frame from exfiltrating data, because `connect-src 'none'` does not block self-navigation or WebRTC; instead the host SHALL minimize the data placed into a Tier-2 frame to only what the plugin strictly needs to render.

#### Scenario: Only strictly-needed content enters the frame

- **WHEN** the host renders a node through a Tier-2 frame
- **THEN** it SHALL pass only the content required to render that node
- **AND** it SHALL NOT pass broad graph or query data the plugin did not request

#### Scenario: Unexpected top-level navigation is treated as hostile

- **WHEN** a Tier-2 frame attempts to navigate its own top-level browsing context
- **THEN** the host MAY tear down the frame
- **AND** residual exfiltration of data the frame legitimately holds SHALL be documented as an accepted risk, not claimed closed

### Requirement: Nonce-keyed schema-validated bidirectional message bridge

The system SHALL mediate all host↔frame communication through `postMessage`, assigning each frame a cryptographic instance nonce, keying every message in both directions by that nonce, validating every inbound message against a strict Zod schema that rejects unknown properties, bounding message size, and dropping any message that fails validation, size, nonce match, or source-identity match.

#### Scenario: Messages are bound to a per-frame nonce in both directions

- **WHEN** the host creates a render frame
- **THEN** it SHALL generate a cryptographic instance nonce for that frame
- **AND** it SHALL accept an inbound message only if the message carries the matching nonce
- **AND** outbound host→frame messages SHALL carry the current nonce so the frame can reject a message intended for a prior occupant

#### Scenario: Source identity is verified

- **WHEN** the host receives an inbound frame message
- **THEN** it SHALL verify `event.source` is the frame's `contentWindow` and drop the message otherwise

#### Scenario: Malformed, unexpected, or oversized messages are dropped

- **WHEN** an inbound frame message fails its Zod schema, carries an unknown property or a wrong nonce, or exceeds the maximum serialized message size
- **THEN** the host SHALL drop the message without acting on it and without unbounded host-memory allocation

#### Scenario: Host never applies frame-supplied DOM attributes

- **WHEN** a frame message requests a host-side effect
- **THEN** the host SHALL dispatch it through a fixed indirect handler exposing only an enumerated action set
- **AND** the host SHALL NOT set any host DOM attribute or property directly from message content

#### Scenario: Frame messages are rate-limited

- **WHEN** a frame emits messages faster than the host rate limit
- **THEN** the host SHALL drop or throttle the excess messages rather than process them unbounded

### Requirement: Virtualized frame pool with state-clearing recycle

The system SHALL render Tier-2 output through a bounded pool of recycled iframes scoped to in-viewport blocks, SHALL NOT allocate one live iframe per block, and SHALL clear browsing-context-scoped state when recycling a frame to a different block.

#### Scenario: Off-screen interactive blocks do not hold a live frame

- **WHEN** an interactive block scrolls out of the viewport
- **THEN** its live frame MAY be recycled to another in-viewport block
- **AND** the off-screen block SHALL show a static preview rather than a live frame

#### Scenario: Pool size is bounded

- **WHEN** many interactive blocks are present in a document
- **THEN** the count of simultaneously live Tier-2 frames SHALL remain within a fixed bound regardless of document length

#### Scenario: Recycling clears context-scoped state

- **WHEN** a frame is recycled from one block to another
- **THEN** the host SHALL either recreate the `<iframe>` element or reset its `name` attribute to a fresh random value before assigning the new `srcdoc`, so `window.name` and other browsing-context state do not leak between blocks
- **AND** the host SHALL rotate the frame's instance nonce

### Requirement: Live-frame visual affordance

The system SHALL render a Tier-2 frame with a persistent visual affordance distinguishing untrusted plugin output from host UI, so a plugin cannot convincingly impersonate host chrome inside its frame rect.

#### Scenario: Sandboxed plugin output is visually distinguishable

- **WHEN** a Tier-2 frame is displayed
- **THEN** it SHALL carry a persistent affordance (such as a border or badge) marking it as sandboxed plugin output

### Requirement: Native shell IPC-surface hardening

The system SHALL ensure that no native-shell IPC surface is reachable from a render frame, not merely that the convenience global is absent, so a guest cannot reach native APIs through an alternate IPC path.

#### Scenario: No Tauri IPC surface is reachable from an untrusted frame

- **WHEN** the application runs inside the Tauri native shell
- **THEN** a Tier-2 render frame SHALL have neither `window.__TAURI__` nor `window.__TAURI_INTERNALS__` nor `window.ipc` injected, and no custom-protocol IPC handler reachable
- **AND** native access SHALL remain gated behind the capability manifest, not exposed via any global bridge
- **AND** initialization scripts SHALL NOT be injected into untrusted subframes

