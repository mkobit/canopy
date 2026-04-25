import type React from 'react';
import { MarkdownRenderer } from './markdown-renderer';
import { TextBlockRenderer } from './text-block-renderer';
import { CodeBlockRenderer } from './code-block-renderer';

export type SystemRendererComponent = React.FC<{
  node: import('@canopy/types').Node;
  graph?: import('@canopy/types').Graph;
  config?: Record<string, unknown>;
}>;

export const SYSTEM_RENDERER_REGISTRY: Record<string, SystemRendererComponent> = {
  'system:markdown': MarkdownRenderer as SystemRendererComponent,
  'system:text-block': TextBlockRenderer as SystemRendererComponent,
  'system:code-block': CodeBlockRenderer as SystemRendererComponent,
};

export function getSystemRenderer(entryPoint: string): SystemRendererComponent | undefined {
  return SYSTEM_RENDERER_REGISTRY[entryPoint];
}
