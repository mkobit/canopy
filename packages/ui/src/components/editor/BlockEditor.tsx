import React from 'react';
import { cn } from '../../utils/cn';

interface BlockEditorData {
  readonly value: string;
  readonly className?: string;
}

interface BlockEditorEvents {
  readonly onChange: (value: string) => unknown;
}

type BlockEditorProps = BlockEditorData & BlockEditorEvents;

export const BlockEditor: React.FC<BlockEditorProps> = ({ value, onChange, className }) => {
  // Simple textarea for now that autosizes or just a div
  // The requirement says "Block editor: rich text editing for text content within nodes."
  // And "Block editor supports basic rich text (bold, italic, links)."

  // Implementing a true rich text editor without a library is complex.
  // I will implement a very basic one using contentEditable and a toolbar.

  const editorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
    }
    return undefined;
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
    }
    return undefined;
  };

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    return undefined;
  };

  return (
    <div className={cn("border rounded bg-white", className)}>
      <div className="flex border-b p-1 gap-1 bg-gray-50">
        <button className="px-2 py-1 hover:bg-gray-200 rounded font-bold text-sm" onClick={() => { exec('bold'); return undefined; }}>B</button>
        <button className="px-2 py-1 hover:bg-gray-200 rounded italic text-sm" onClick={() => { exec('italic'); return undefined; }}>I</button>
        <button className="px-2 py-1 hover:bg-gray-200 rounded text-sm underline" onClick={() => { exec('underline'); return undefined; }}>U</button>
        <button className="px-2 py-1 hover:bg-gray-200 rounded text-sm text-blue-600" onClick={() => {
            const url = prompt('Enter URL');
            if(url) exec('createLink', url);
            return undefined;
        }}>Link</button>
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
