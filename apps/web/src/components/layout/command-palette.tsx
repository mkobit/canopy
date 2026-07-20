import React, { useEffect, useRef, useState } from 'react';
import { usePlugin } from '../../context/plugin-context';

export const CommandPalette: React.FC = () => {
  const { commands, startWizard } = usePlugin();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter commands based on query
  const filteredCommands = commands.filter((cmd) => {
    const text = `${cmd.title} ${cmd.category ?? ''}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  // Listen for keyboard shortcuts to toggle command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on Ctrl+P or Ctrl+Shift+P
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle auto-focus and reset on open/close
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small timeout to allow dialog to render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredCommands.length > 0 ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        handleTriggerCommand(selected.id);
      }
    }
  };

  const handleTriggerCommand = (commandId: string) => {
    setIsOpen(false);
    void startWizard(commandId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={containerRef}
        className="w-full max-w-lg bg-[#0e141b] rounded-xl border border-[#2a3c54]/30 shadow-2xl overflow-hidden flex flex-col max-h-[300px] animate-in slide-in-from-top-4 duration-200"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a3c54]/30 bg-[#121a25]/50">
          <span className="material-symbols-outlined text-[#a2c9ff] text-[20px]">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command to run..."
            className="w-full bg-transparent border-none text-sm text-on-surface focus:outline-none placeholder-on-surface-variant/40 font-body"
          />
          <kbd className="text-[10px] text-on-surface-variant bg-[#1a2637]/50 px-2 py-0.5 rounded border border-[#2a3c54]/20 font-mono">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="flex-1 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-on-surface-variant font-body">No commands found</div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  onClick={() => handleTriggerCommand(cmd.id)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-4 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
                    isSelected ? 'bg-primary-container text-on-primary-container font-bold' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-2.5 font-body">
                    <span className="material-symbols-outlined text-[16px]">terminal</span>
                    <span>{cmd.title}</span>
                  </div>
                  {cmd.category && (
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
                        isSelected ? 'bg-primary/20 text-on-primary-container' : 'bg-[#1a2637]/40 text-on-surface-variant/60'
                      }`}
                    >
                      {cmd.category}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
