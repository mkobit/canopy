import React from 'react';

export interface TopAppBarProps {
  readonly onRunQuery?: (query: string) => unknown;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({ onRunQuery }) => {
  const [query, setQuery] = React.useState('');

  const handleRun = () => {
    onRunQuery?.(query);
    return undefined;
  };

  return (
    <header className="h-16 border-b border-[#1a2637]/30 flex items-center px-6 justify-between bg-surface-container-lowest sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <h1 className="font-bold text-lg tracking-wide text-on-surface">SEMANTIC ARCHITECT</h1>
        <div className="h-6 w-px bg-outline-variant/30 mx-2"></div>
        <button className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors bg-surface-container py-1.5 px-3 rounded-md">
          <span className="material-symbols-outlined text-[18px]">cloud</span>
          <span>AWS-PRODUCTION-01</span>
          <span className="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
      </div>

      <div className="flex-1 max-w-3xl mx-8 relative flex items-center group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="material-symbols-outlined text-primary/70 text-[18px]">terminal</span>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            return undefined;
          }}
          className="w-full bg-surface-container-high border-b-2 border-transparent focus:border-primary focus:bg-surface-container-highest transition-all duration-300 py-2 pl-10 pr-32 text-sm font-mono text-on-surface focus:outline-none placeholder-on-surface-variant/50"
          placeholder="MATCH (n:Person {name: 'Tom Hanks'}) RETURN n"
        />
        <button
          onClick={handleRun}
          className="absolute right-1 top-1 bottom-1 bg-gradient-to-br from-primary to-primary-container text-on-primary-container text-xs font-bold px-4 rounded hover:brightness-110 active:scale-95 transition-all"
        >
          RUN QUERY
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button className="text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>
        <div className="w-8 h-8 rounded bg-surface-container-high border border-outline-variant/30 flex items-center justify-center overflow-hidden cursor-pointer">
          <span className="material-symbols-outlined text-primary">person</span>
        </div>
      </div>
    </header>
  );
};
