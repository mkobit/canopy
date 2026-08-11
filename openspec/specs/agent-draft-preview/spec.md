# agent-draft-preview Specification

## Purpose

Exposes `@canopy/graph`'s `DraftSession` over the IPC transport as a `canopy.v1.draft.*` method family, so an agent (or any remote client) can stage and preview a batch of mutations against a connection-scoped overlay before committing them, with optimistic-concurrency conflict detection surfaced as recoverable domain data rather than a transport failure.

## Requirements

### Requirement: Two-phase draft preview over JSON-RPC

The `@canopy/api-adapter` package SHALL expose `DraftSession` over the IPC transport as a `canopy.v1.draft.*` method family implementing a connection-scoped, two-phase preview/commit flow.
Each draft SHALL be created by `createDraftSession(session)`, keyed by a server-generated `draftId`, and owned by the connection that created it.

#### Scenario: Create a draft

- **WHEN** a client calls `canopy.v1.draft.create`
- **THEN** the server SHALL create a `DraftSession` over the hosted session and return `{ draftId, parentRevision }` where `parentRevision` is the current parent graph revision.

#### Scenario: Stage events into a draft

- **WHEN** a client calls `canopy.v1.draft.apply` with `{ draftId, events }`
- **THEN** the server SHALL call `applyEvents` on the draft and return success
- **AND** on a `validation-failure` DraftError it SHALL return a structured JSON-RPC domain error carrying `data.type` and leave the draft unchanged.

#### Scenario: Preview staged changes without committing

- **WHEN** a client calls `canopy.v1.draft.preview` with `{ draftId }`
- **THEN** the server SHALL return a bounded diff summary of the overlay versus the parent — change counts plus a capped list of touched node and edge ids — computed from the combined projection
- **AND** the parent graph SHALL remain unmodified.

### Requirement: Draft commit enforces optimistic concurrency

The draft commit method SHALL apply staged events to the parent session only when the caller's expected parent revision matches, and SHALL represent a mismatch as a recoverable conflict rather than a transport failure.

#### Scenario: Successful commit

- **WHEN** a client calls `canopy.v1.draft.commit` with `{ draftId, expectedParentRevision }` and the parent revision matches
- **THEN** the server SHALL commit the staged events through the parent session, clear the draft, and return success.

#### Scenario: Concurrent-modification conflict

- **WHEN** a client calls `canopy.v1.draft.commit` but the parent revision has advanced
- **THEN** the server SHALL return a structured JSON-RPC domain error with `data.type = "concurrent-modification"` and the current parent revision
- **AND** the draft SHALL remain active so the client can re-preview and retry.

### Requirement: Draft state is bounded and connection-scoped

Draft overlays SHALL be held server-side, tied to the owning connection, and bounded to prevent resource exhaustion.

#### Scenario: Cleanup on disconnect

- **WHEN** a connection that owns one or more drafts closes or errors
- **THEN** the server SHALL discard those drafts and free their staged-event state, mirroring subscription cleanup.

#### Scenario: Draft limits enforced

- **WHEN** a client exceeds the configured cap on concurrent drafts, staged events per draft, or preview result size
- **THEN** the server SHALL reject the offending request with a domain error rather than growing state unbounded.
