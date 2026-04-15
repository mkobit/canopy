import React, { useState } from 'react';

export interface QuickEntryOverlayProps {
  readonly onSubmit?: (text: string) => unknown;
}

export const QuickEntryOverlay: React.FC<QuickEntryOverlayProps> = ({ onSubmit }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && onSubmit) {
      onSubmit(inputValue.trim());
      setInputValue('');
      setIsExpanded(false);
    }
    return undefined;
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
      {isExpanded ? (
        <form
          onSubmit={handleSubmit}
          className="bg-surface-container-highest/90 backdrop-blur-md border border-outline-variant/30 rounded shadow-[0_20px_40px_rgba(0,0,0,0.4)] p-4 flex flex-col gap-3 w-[400px] max-w-[90vw] transition-all"
        >
          <div className="flex justify-between items-center">
            <label className="text-sm font-mono text-primary font-bold">Quick Entry</label>
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                return undefined;
              }}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Capture node or edge..."
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              return undefined;
            }}
            className="bg-surface-container-lowest text-on-surface border-b-2 border-primary/50 focus:border-primary outline-none px-3 py-2 text-sm font-sans w-full"
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-wider">
              Format: Node Name [-&gt; Other Node]
            </span>
            <button
              type="submit"
              className="bg-gradient-to-b from-primary to-primary-container text-on-primary text-xs font-bold px-4 py-1.5 rounded-sm hover:brightness-110 transition-all"
            >
              CREATE
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => {
            setIsExpanded(true);
            return undefined;
          }}
          className="bg-gradient-to-b from-primary to-primary-container text-on-primary rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.4)] px-6 py-3 flex items-center gap-2 hover:scale-105 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span className="font-bold text-sm tracking-wide">Capture</span>
        </button>
      )}
    </div>
  );
};
