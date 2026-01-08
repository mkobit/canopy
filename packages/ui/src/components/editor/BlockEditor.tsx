import React from 'react';
import { cn } from '../../utils/cn';

interface BlockEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
}

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
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
    }
  };

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  return (
    <div className={cn("border rounded bg-white", className)}>
      <div className="flex border-b p-1 gap-1 bg-gray-50">
        <button className="px-2 py-1 hover:bg-gray-200 rounded font-bold text-sm" onClick={() => exec('bold')}>B</button>
        <button className="px-2 py-1 hover:bg-gray-200 rounded italic text-sm" onClick={() => exec('italic')}>I</button>
        <button className="px-2 py-1 hover:bg-gray-200 rounded text-sm underline" onClick={() => exec('underline')}>U</button>
        <button className="px-2 py-1 hover:bg-gray-200 rounded text-sm text-blue-600" onClick={() => {
            const url = prompt('Enter URL');
            if(url) exec('createLink', url);
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
