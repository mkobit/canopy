import React from 'react';
import type { Node } from '@canopy/graph';

export interface CodeBlockRendererProps {
  node: Node;
  className?: string;
}

export const CodeBlockRenderer: React.FC<CodeBlockRendererProps> = ({ node, className }) => {
  const content = node.properties.get('content');
  if (typeof content !== 'string') {
    return <div className="text-red-500">Invalid code content</div>;
  }

  const language = node.properties.get('language');

  return (
    <div
      className={`relative bg-[#0c0f0f] text-[#f8f8ff] p-4 rounded-md overflow-x-auto ${className || ''}`}
    >
      {language && typeof language === 'string' && (
        <div className="absolute top-2 right-3 text-xs text-gray-500 font-mono select-none">
          {language}
        </div>
      )}
      <pre className="m-0 font-mono text-sm leading-snug whitespace-pre-wrap">
        <code>{content}</code>
      </pre>
    </div>
  );
};
