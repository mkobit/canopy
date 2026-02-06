import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Node } from '@canopy/types';

export interface MarkdownRendererProps {
  node: Node;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ node, className }) => {
  const content = node.properties.get('content');

  if (typeof content !== 'string') {
    return <div className="text-red-500">Invalid markdown content</div>;
  }

  return (
    <div className={`prose dark:prose-invert ${className || ''}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
};
