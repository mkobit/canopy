import React from 'react';
import type { Node } from '@canopy/types';

export interface TextBlockRendererProps {
  node: Node;
  className?: string;
}

export const TextBlockRenderer: React.FC<TextBlockRendererProps> = ({ node, className }) => {
  const content = node.properties.get('content');

  if (!content) {
    return <div className={`text-gray-400 italic ${className || ''}`}>Empty text block</div>;
  }

  // The property is defined as 'list' of segments in bootstrap, but often it might be a string.
  // We'll handle both cases to be safe.
  const text = Array.isArray(content)
    ? content.join('')
    : typeof content === 'string'
      ? content
      : JSON.stringify(content);

  return <div className={`text-gray-800 leading-relaxed ${className || ''}`}>{text}</div>;
};
