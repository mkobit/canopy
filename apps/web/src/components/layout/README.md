# Layout components

## Overview

This directory provides the application shell components (`TopAppBar`, `SideNavBar`), modal dialogs (`NewNodeDialog`, `WizardDialog`), and keyboard-driven `CommandPalette` for navigation and plugin command execution.

## Interface

- `[command-palette.tsx:CommandPalette]` Exported `React.FC` rendering the global search and command palette dialog.
- `[new-node-dialog.tsx:NewNodeDialogProperties]` Exported interface with `readonly` props: `open`, `nodeTypes`, `onSubmit`, `onCancel`.
- `[new-node-dialog.tsx:NewNodeDialog]` Exported `React.FC<NewNodeDialogProperties>` rendering a modal `<dialog>` for creating a typed node.
- `[side-nav-bar.tsx:SideNavBarProperties]` Exported interface with optional `readonly` props: `onNewNode`, `onLogout`, `graphId`.
- `[side-nav-bar.tsx:SideNavBar]` Exported `React.FC<SideNavBarProperties>` rendering the fixed left navigation sidebar.
- `[top-app-bar.tsx:TopAppBarProperties]` Exported interface with optional `readonly` prop: `onRunQuery`.
- `[top-app-bar.tsx:TopAppBar]` Exported `React.FC<TopAppBarProperties>` rendering the sticky top bar with query input.
- `[wizard-dialog.tsx:WizardDialog]` Exported `React.FC` rendering the active plugin wizard step in a modal `<dialog>`.

## Invariants

- `[command-palette.tsx:isCommandMode]` Queries starting with `'>'` (after `trimStart`) enter command mode and filter commands by title/category; otherwise `[command-palette.tsx:useFilteredItems]` queries `SYSTEM_IDS.QUERY_ALL_NODES`, filters by node id or string `'name'` property, and caps results at 10.
- `[command-palette.tsx:useKeyboardNav]` `ArrowDown`/`ArrowUp` wrap `selectedIndex` modulo `filteredCount` (or reset to 0 when `filteredCount` is 0); `Escape` closes the palette; `Enter` triggers `handleConfirm`.
- `[new-node-dialog.tsx:hasRequiredMissing]` Create button is disabled unless `selectedType` exists and every required property passes `!isEmpty` (non-boolean/non-number values cannot be `null`, `undefined`, empty string, or empty array).
- `[new-node-dialog.tsx:useNewNodeDialogState]` Opening the dialog initializes `selectedTypeId` to `nodeTypes[0]?.id ?? null` and resets values via `initialValuesFor`; changing type resets values to that type's defaults.
- `[side-nav-bar.tsx:SideNavBar]` Schema and Views links (`SYSTEM_IDS.VIEW_ALL_NODES`, `VIEW_BY_TYPE`, `VIEW_RECENT`) render only when `graphId !== undefined`; Plugins section renders only when `graphId !== undefined && menuItems.length > 0`.
- `[wizard-dialog.tsx:WizardDialog]` Renders `null` when `activeWizard` is falsy; Submit button is disabled when `isFormInvalid()` detects a required non-boolean field that is `undefined`, `null`, whitespace-only string, or `NaN` for `kind === 'number'`.
- `[wizard-dialog.tsx:WizardDialog]` Opening a closed dialog initializes `formValues` with `getInitialValues`, whereas step transitions while already open merge new defaults while preserving existing `formValues` via `updateDefaultValues`.

## Side Effects

- `[command-palette.tsx:useShortcutToggle]` Registers/removes a global `keydown` listener (`Ctrl/Cmd+P`, with `Shift` prefilling `'>'`) to toggle palette open state.
- `[command-palette.tsx:useClickOutside]` Registers/removes a document `mousedown` listener while `isOpen` is `true` to close on outside clicks.
- `[command-palette.tsx:CommandPalette]` Schedules a 50ms `setTimeout` to focus `inputReference.current` on open, and calls `activeElement.scrollIntoView({ block: 'nearest' })` when `selectedIndex` or `isOpen` changes.
- `[command-palette.tsx:useConfirmationHandler]` Invokes `startWizard(commandId)` on command selection or `navigate('/graph/${activeGraphId}/node/${nodeId}')` on node selection when `activeGraphId` is defined.
- `[new-node-dialog.tsx:useNewNodeDialogState]` Calls `dialog.showModal()` and `dialog.close()` on the `<dialog>` ref as `open` changes; `[new-node-dialog.tsx:getInitialValue]` reads `Temporal.Now.instant()` and `Temporal.Now.plainDateISO()` for temporal defaults.
- `[new-node-dialog.tsx:NewNodeDialog]` Invokes `onSubmit(selectedType.id, values)` on form submit and `onCancel` on cancel click, dialog close, or dialog cancel.
- `[side-nav-bar.tsx:SideNavBar]` Invokes `startWizard(item.command)` on plugin button click and `onNewNode` / `onLogout` callbacks on action button clicks.
- `[top-app-bar.tsx:TopAppBar]` Invokes `onRunQuery?.(query)` when the `RUN QUERY` button is clicked.
- `[wizard-dialog.tsx:WizardDialog]` Calls `dialog.showModal()` and `dialog.close()` on the `<dialog>` ref based on `activeWizard`, and invokes `submitWizardStep(new Map(...))` on submit or `cancelWizard()` on cancel/close.

## Verification

- Run: `bun test`
