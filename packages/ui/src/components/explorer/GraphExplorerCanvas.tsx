import React from 'react';

export interface GraphExplorerCanvasProps {
  children?: React.ReactNode;
}

export const GraphExplorerCanvas: React.FC<GraphExplorerCanvasProps> = ({ children }) => {
  return (
    <div className="flex-1 bg-surface-dim relative overflow-hidden flex flex-col">
      {/* Sub-header Navigation */}
      <div className="h-12 border-b border-outline-variant/10 flex items-center px-6 justify-between bg-surface-container-lowest/50">
        <div className="flex gap-1 bg-surface-container p-1 rounded">
          <button className="px-4 py-1.5 text-xs font-bold bg-primary-container/20 text-primary rounded shadow-sm">
            GRAPH
          </button>
          <button className="px-4 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors">
            TABLE
          </button>
          <button className="px-4 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors">
            RAW
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            System Connected
          </span>
          <span>Query: 14ms</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Dot Grid Background */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, var(--color-outline-variant) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        ></div>

        {/* Actual Content (passed via children, e.g. React Flow or SVG graph) */}
        {children}

        {/* Zoom Controls */}
        <div className="absolute left-6 bottom-6 flex flex-col gap-2">
          <div className="bg-surface-container border border-outline-variant/20 rounded flex flex-col shadow-lg">
            <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors border-b border-outline-variant/20">
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
            <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-[20px]">remove</span>
            </button>
          </div>
          <button className="p-2 bg-surface-container border border-outline-variant/20 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shadow-lg">
            <span className="material-symbols-outlined text-[20px]">fit_screen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
