import React, { useState } from 'react';
import type { Node } from '@canopy/graph';
import { GenericPropertyTableInspector } from './generic-property-table-inspector';

export interface RendererErrorBannerProperties {
  readonly node: Node;
  readonly error?: string | Error | undefined;
  readonly className?: string | undefined;
}

export const RendererErrorBanner: React.FC<RendererErrorBannerProperties> = ({
  node,
  error,
  className = '',
}) => {
  const [showProperties, setShowProperties] = useState(false);

  const errorMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'Unknown execution error';

  const handleToggle = (): void => {
    setShowProperties((current) => !current);
  };

  return (
    <div
      role="alert"
      data-testid="renderer-error-banner"
      className={`border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 rounded-md p-3 text-red-900 dark:text-red-200 text-xs space-y-2 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-xs tracking-wide">Renderer execution failed</div>
        <button
          type="button"
          data-testid="inspect-properties-button"
          onClick={handleToggle}
          className="px-2 py-0.5 border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-red-800 dark:text-red-200 rounded text-[11px] font-sans hover:bg-red-100 dark:hover:bg-gray-700 transition-colors"
        >
          {showProperties ? 'Hide properties' : 'Inspect properties'}
        </button>
      </div>
      <div className="text-red-700 dark:text-red-300 font-mono text-[11px] break-words">
        {errorMessage}
      </div>
      {showProperties && (
        <div className="pt-2 border-t border-red-200 dark:border-red-800">
          <GenericPropertyTableInspector node={node} />
        </div>
      )}
    </div>
  );
};
