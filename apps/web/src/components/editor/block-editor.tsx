import React from 'react';
import { cn } from '../../utils/cn';
import { showPrompt } from '../../utils/dialogs';

export interface BlockEditorProperties {
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly className?: string;
  /** Idle debounce before an edit auto-commits. Overridable for tests; defaults to ~1s. */
  readonly idleMs?: number;
}

const DEFAULT_IDLE_MS = 1000;

const EditorToolbar: React.FC<Readonly<{ onExec: (command: string, value?: string) => void }>> = ({
  onExec,
}) => (
  <div className="flex border-b p-1 gap-1 bg-gray-50 border-gray-200">
    <button
      className="px-2 py-1 hover:bg-gray-200 rounded font-bold text-sm cursor-pointer"
      onClick={() => onExec('bold')}
    >
      B
    </button>
    <button
      className="px-2 py-1 hover:bg-gray-200 rounded italic text-sm cursor-pointer"
      onClick={() => onExec('italic')}
    >
      I
    </button>
    <button
      className="px-2 py-1 hover:bg-gray-200 rounded text-sm underline cursor-pointer"
      onClick={() => onExec('underline')}
    >
      U
    </button>
    <button
      className="px-2 py-1 hover:bg-gray-200 rounded text-sm text-blue-600 cursor-pointer"
      onClick={() => {
        const url = showPrompt('Enter URL');
        if (url) onExec('createLink', url);
      }}
    >
      Link
    </button>
  </div>
);

/**
 * Event-sourced block editor: edits a plain-string property via local (uncontrolled,
 * DOM-owned) state and commits on idle/blur/unmount. No CRDT -- undo is browser-native
 * contentEditable undo, and the losing side of a concurrent whole-property LWW write
 * stays recoverable in the event log (see openspec block-editing spec).
 */
export const BlockEditor: React.FC<BlockEditorProperties> = ({
  value,
  onCommit,
  className,
  idleMs = DEFAULT_IDLE_MS,
}) => {
  const editorReference = React.useRef<HTMLDivElement>(null);
  // Latest known content, tracked independent of the DOM ref so a flush on unmount
  // (which can run after React has already detached the ref) still sees it.
  const contentReference = React.useRef(value);
  const lastCommittedReference = React.useRef(value);
  const timerReference = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCommitReference = React.useRef(onCommit);

  React.useEffect(() => {
    onCommitReference.current = onCommit;
  });

  const flush = React.useCallback(() => {
    if (timerReference.current !== undefined) {
      clearTimeout(timerReference.current);
      timerReference.current = undefined;
    }
    if (contentReference.current !== lastCommittedReference.current) {
      lastCommittedReference.current = contentReference.current;
      onCommitReference.current(contentReference.current);
    }
  }, []);

  React.useEffect(() => {
    if (editorReference.current) {
      editorReference.current.innerHTML = value;
    }
    contentReference.current = value;
    lastCommittedReference.current = value;
    // Seeds initial content on mount only -- this editor owns local state thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    return flush;
  }, [flush]);

  const handleInput = () => {
    contentReference.current = editorReference.current?.getHTML() ?? contentReference.current;
    if (timerReference.current !== undefined) clearTimeout(timerReference.current);
    timerReference.current = setTimeout(flush, idleMs);
  };

  const exec = (command: string, execValue?: string) => {
    document.execCommand(command, false, execValue);
    editorReference.current?.focus();
    handleInput();
  };

  return (
    <div className={cn('border rounded bg-white text-black', className)}>
      <EditorToolbar onExec={exec} />
      <div
        ref={editorReference}
        contentEditable
        className="p-3 min-h-[100px] outline-none"
        onInput={handleInput}
        onBlur={flush}
      />
    </div>
  );
};
