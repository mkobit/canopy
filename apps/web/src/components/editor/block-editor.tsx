import React from 'react';
import type * as Y from 'yjs';
import { cn } from '../../utils/cn';
import { showPrompt } from '../../utils/dialogs';

interface BlockEditorProps {
  readonly ytext: Y.Text;
  readonly className?: string;
}

function applyStringDiff(ytext: Y.Text, oldVal: string, newVal: string): void {
  // eslint-disable-next-line functional/no-let -- index tracking
  let commonPrefix = 0;
  // eslint-disable-next-line functional/no-loop-statements -- prefix scan
  while (
    commonPrefix < oldVal.length &&
    commonPrefix < newVal.length &&
    oldVal[commonPrefix] === newVal[commonPrefix]
  ) {
    commonPrefix++;
  }

  // eslint-disable-next-line functional/no-let -- index tracking
  let commonSuffix = 0;
  // eslint-disable-next-line functional/no-loop-statements -- suffix scan
  while (
    commonSuffix + commonPrefix < oldVal.length &&
    commonSuffix + commonPrefix < newVal.length &&
    oldVal[oldVal.length - 1 - commonSuffix] === newVal[newVal.length - 1 - commonSuffix]
  ) {
    commonSuffix++;
  }

  const deleteCount = oldVal.length - commonPrefix - commonSuffix;
  const insertText = newVal.slice(commonPrefix, newVal.length - commonSuffix);

  if (deleteCount > 0 || insertText.length > 0) {
    const doc = ytext.doc;
    if (doc) {
      doc.transact(() => {
        if (deleteCount > 0) {
          ytext.delete(commonPrefix, deleteCount);
        }
        if (insertText.length > 0) {
          ytext.insert(commonPrefix, insertText);
        }
      });
    } else {
      if (deleteCount > 0) {
        ytext.delete(commonPrefix, deleteCount);
      }
      if (insertText.length > 0) {
        ytext.insert(commonPrefix, insertText);
      }
    }
  }
}

export const BlockEditor: React.FC<BlockEditorProps> = ({ ytext, className }) => {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const localContentRef = React.useRef('');

  React.useEffect(() => {
    if (!editorRef.current) return undefined;

    const initialText = ytext.toString();
    editorRef.current.innerHTML = initialText;
    localContentRef.current = initialText;

    const observer = (event: Y.YTextEvent) => {
      if (event.transaction.local) return;

      if (editorRef.current) {
        const currentText = ytext.toString();
        if (editorRef.current.innerHTML !== currentText) {
          editorRef.current.innerHTML = currentText;
          localContentRef.current = currentText;
        }
      }
    };

    ytext.observe(observer);

    return () => {
      ytext.unobserve(observer);
    };
  }, [ytext]);

  const handleInput = () => {
    if (!editorRef.current) return;
    const newVal = editorRef.current.innerHTML;
    const oldVal = localContentRef.current;

    if (newVal === oldVal) return;

    localContentRef.current = newVal;
    applyStringDiff(ytext, oldVal, newVal);
  };

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
    return undefined;
  };

  return (
    <div className={cn('border rounded bg-white text-black', className)}>
      <div className="flex border-b p-1 gap-1 bg-gray-50 border-gray-200">
        <button
          className="px-2 py-1 hover:bg-gray-200 rounded font-bold text-sm cursor-pointer"
          onClick={() => {
            exec('bold');
            return undefined;
          }}
        >
          B
        </button>
        <button
          className="px-2 py-1 hover:bg-gray-200 rounded italic text-sm cursor-pointer"
          onClick={() => {
            exec('italic');
            return undefined;
          }}
        >
          I
        </button>
        <button
          className="px-2 py-1 hover:bg-gray-200 rounded text-sm underline cursor-pointer"
          onClick={() => {
            exec('underline');
            return undefined;
          }}
        >
          U
        </button>
        <button
          className="px-2 py-1 hover:bg-gray-200 rounded text-sm text-blue-600 cursor-pointer"
          onClick={() => {
            const url = showPrompt('Enter URL');
            if (url) exec('createLink', url);
            return undefined;
          }}
        >
          Link
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        className="p-3 min-h-[100px] outline-none"
        onInput={handleInput}
      />
    </div>
  );
};
