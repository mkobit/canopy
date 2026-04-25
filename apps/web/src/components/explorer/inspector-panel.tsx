import React from 'react';

export interface InspectorNodeData {
  readonly id?: string;
  readonly name?: string;
  readonly type?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

// eslint-disable-next-line functional/no-mixed-types
export interface InspectorPanelProps {
  readonly selectedNode?: InspectorNodeData;
  readonly onClose?: () => unknown;
}

export const InspectorPanel = ({
  selectedNode,
  onClose,
}: Readonly<InspectorPanelProps>): React.ReactElement => {
  return (
    <div className="absolute right-6 top-24 bottom-6 w-80 bg-surface-container-highest/80 backdrop-blur-xl border border-outline-variant/20 rounded-lg shadow-[0_20px_40px_rgba(0,0,0,0.6)] flex flex-col z-20">
      <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center">
        <h3 className="font-display font-bold text-sm tracking-wider">INSPECTOR</h3>
        <button
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-container-low p-3 rounded flex flex-col justify-between">
            <span className="text-[10px] text-on-surface-variant font-display uppercase tracking-wider mb-2">
              Nodes
            </span>
            <span className="text-xl font-mono text-primary">13</span>
          </div>
          <div className="bg-surface-container-low p-3 rounded flex flex-col justify-between">
            <span className="text-[10px] text-on-surface-variant font-display uppercase tracking-wider mb-2">
              Relationships
            </span>
            <span className="text-xl font-mono text-tertiary">13</span>
          </div>
        </div>

        {/* Selected Node Details */}
        <div>
          <h4 className="text-[10px] text-on-surface-variant font-display uppercase tracking-wider mb-3">
            Active Selection
          </h4>
          <div className="bg-surface-container p-4 rounded-lg border-l-2 border-primary">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded bg-primary-container/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[18px]">person</span>
              </div>
              <div>
                <div className="font-bold text-sm">{selectedNode?.name || 'No selection'}</div>
                <div className="text-[10px] font-mono text-primary mt-0.5">
                  LABEL: {selectedNode?.type || 'Unknown'}
                </div>
              </div>
            </div>

            {selectedNode && (
              <div className="space-y-3">
                <div className="flex justify-between items-baseline border-b border-outline-variant/10 pb-2">
                  <span className="text-xs text-on-surface-variant font-display uppercase">ID</span>
                  <span className="text-xs font-mono text-on-surface">{selectedNode.id}</span>
                </div>
                {Object.entries(selectedNode.properties || {}).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex justify-between items-baseline border-b border-outline-variant/10 pb-2"
                  >
                    <span className="text-xs text-on-surface-variant font-display uppercase">
                      {key}
                    </span>
                    <span className="text-xs font-mono text-on-surface">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
