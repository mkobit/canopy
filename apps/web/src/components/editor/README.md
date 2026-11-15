# Block editor component

## Overview

This directory implements an uncontrolled `contentEditable` React block editor (`BlockEditor`) with a formatting toolbar (`EditorToolbar`) that owns local DOM state after mount and commits HTML string edits via `onCommit` on idle debounce, blur, or unmount.

## Interface

- `[block-editor.tsx:BlockEditorProperties]` Exported interface `{ readonly value: string; readonly onCommit: (value: string) => void; readonly className?: string; readonly idleMs?: number; }`.
- `[block-editor.tsx:BlockEditor]` Exported `React.FC<BlockEditorProperties>` rendering the toolbar and `contentEditable` block editor.

## Invariants

- `[block-editor.tsx:BlockEditorProperties]` All `BlockEditorProperties` fields are `readonly`.
- `[block-editor.tsx:BlockEditor]` Initial content is seeded from `value` on mount only (empty `useEffect` dependency array), with local DOM state owned by the editor thereafter.
- `[block-editor.tsx:flush]` Skips invoking `onCommitReference.current` when `contentReference.current === lastCommittedReference.current`.
- `[block-editor.tsx:contentReference]` Tracks the latest known content independently of `editorReference` so unmount flush remains valid after DOM ref detachment.

## Side Effects

- `[block-editor.tsx:BlockEditor]` Mount `useEffect` mutates `editorReference.current.innerHTML = value`; render `useEffect` updates `onCommitReference.current = onCommit`.
- `[block-editor.tsx:handleInput]` Clears any active timer with `clearTimeout` and schedules `setTimeout(flush, idleMs)`.
- `[block-editor.tsx:flush]` Clears pending timeout, updates `lastCommittedReference.current`, and calls `onCommitReference.current(contentReference.current)` on idle timeout, `onBlur`, or unmount cleanup.
- `[block-editor.tsx:exec]` Calls `document.execCommand(command, false, execValue)`, focuses `editorReference.current`, and triggers `handleInput`.
- `[block-editor.tsx:EditorToolbar]` Link button calls `showPrompt('Enter URL')` and conditionally invokes `onExec('createLink', url)`.

## Verification

- Run: `bun test`
