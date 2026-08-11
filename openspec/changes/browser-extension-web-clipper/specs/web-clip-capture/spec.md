## ADDED Requirements

### Requirement: Browser extension captures a page or selection into a structured clip

The browser extension SHALL, on an explicit user action, capture the active tab's page (or the current text selection when one exists) into a structured clip payload carrying at minimum a `title`, a `sourceUrl`, extracted `content`, and a `capturedAt` timestamp.
The content script SHALL extract this payload as inert data (strings) and SHALL NOT execute, evaluate, or forward page-provided code.

#### Scenario: Clip the whole page

- **WHEN** the user invokes the extension action on a tab with no active text selection
- **THEN** the extension SHALL produce a clip payload whose `sourceUrl` is the tab URL, `title` is the document title, `content` is the extracted main content, and `capturedAt` is the capture time

#### Scenario: Clip a selection

- **WHEN** the user invokes the extension action while text is selected on the page
- **THEN** the extension SHALL produce a clip payload whose `content` is the selected text and whose `sourceUrl`/`title`/`capturedAt` are set as for a whole-page clip

#### Scenario: Page-provided content is treated as data, never executed

- **WHEN** the captured DOM or selection contains scripts, event handlers, or other active markup
- **THEN** the extension SHALL carry that material only as inert string content and SHALL NOT execute it in the extension or host context

### Requirement: A clip is landed as a runtime-authored WebClip node, not a kernel type

A clipped page SHALL be represented as an instance of a `WebClip` `NodeType` defined at runtime in a non-restricted `clip` namespace via the existing dynamic type-authoring control plane (`createNamespace`, `createNodeType`), with `title`, `sourceUrl`, `content`, and `capturedAt` modeled using existing `PropertyValueKind` values (`string`).
No new built-in type SHALL be added to `@canopy/graph`, and the `clip` namespace and `WebClip` type SHALL NOT be seeded into kernel bootstrap.

#### Scenario: WebClip type is ensured idempotently before the first clip

- **WHEN** a clip is about to be landed and no non-deleted `WebClip` `NodeType` in the `clip` namespace exists yet
- **THEN** the system SHALL author the `clip` namespace and `WebClip` `NodeType` through the existing type-authoring ops before creating the clip instance
- **AND** WHEN the type already exists it SHALL be reused without creating a duplicate

#### Scenario: No kernel change is required to land a clip

- **WHEN** a clip node is created
- **THEN** it SHALL be created solely through the existing `type-authoring` ops and the existing `canopy.v1.mutation.createNode` / `canopy.v1.draft.*` surface, with no new `PropertyValueKind` and no `@canopy/graph` code change

### Requirement: A clip is committed only after explicit user confirmation of a preview

The extension SHALL stage a clip through the daemon's `canopy.v1.draft.*` two-phase flow and SHALL present the previewed result to the user, committing the draft only after an explicit user confirmation.
The extension SHALL NOT commit clips automatically, in the background, or without a user-initiated capture.

#### Scenario: User confirms a previewed clip

- **WHEN** the user has captured a page and the extension has previewed the staged `WebClip` node
- **THEN** the extension SHALL commit the draft only after the user explicitly confirms, and SHALL surface the resulting node identity

#### Scenario: User discards a previewed clip

- **WHEN** the user declines the preview
- **THEN** the extension SHALL discard the draft and SHALL NOT create any node

#### Scenario: No silent or background capture

- **WHEN** no user-initiated capture action has occurred
- **THEN** the extension SHALL NOT create, stage, or commit any clip
