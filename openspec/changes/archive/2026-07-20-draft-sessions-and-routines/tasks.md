## 1. Core DraftSession Implementation

- [x] 1.1 Implement the `DraftSession` interface and state types in `@canopy/graph` packages.
- [x] 1.2 Implement the `applyDraftEvents` function to stage uncommitted events.
- [x] 1.3 Implement combined graph projection overlay in `incremental-projection.ts`.
- [x] 1.4 Write unit tests in `@canopy/graph` verifying draft sessions (apply, commit, and discard operations).

## 2. Plugin Wizard & UI Integration

- [x] 2.1 Define WASM/WIT interface contracts for plugin manifests and step rendering.
- [x] 2.2 Implement plugin loading, menu registration, and command palette integration in `apps/web`.
- [x] 2.3 Build the wizard step manager and HTML form renderer.
- [x] 2.4 Hook user inputs into `handle-input` callbacks to stage events in the draft session.
- [x] 2.5 Add integration tests using a mock in-memory plugin wizard.

