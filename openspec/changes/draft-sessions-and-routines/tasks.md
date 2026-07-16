## 1. Core DraftSession Implementation

- [ ] 1.1 Implement the `DraftSession` interface and state types in `@canopy/graph` packages.
- [ ] 1.2 Implement the `applyDraftEvents` function to stage uncommitted events.
- [ ] 1.3 Implement combined graph projection overlay in `incremental-projection.ts`.
- [ ] 1.4 Write unit tests in `@canopy/graph` verifying draft sessions (apply, commit, and discard operations).

## 2. Plugin Wizard & UI Integration

- [ ] 2.1 Define WASM/WIT interface contracts for plugin manifests and step rendering.
- [ ] 2.2 Implement plugin loading, menu registration, and command palette integration in `apps/web`.
- [ ] 2.3 Build the wizard step manager and HTML form renderer.
- [ ] 2.4 Hook user inputs into `handle-input` callbacks to stage events in the draft session.
- [ ] 2.5 Add integration tests using a mock in-memory plugin wizard.
