import type React from 'react';
import type { Node, Graph, PropertyValue, SystemRendererEntryPoint } from '@canopy/graph';
import { TextBlockRenderer } from './text-block-renderer';
import { CodeBlockRenderer } from './code-block-renderer';
import { MarkdownRenderer } from './markdown-renderer';

export type RegistryComponent = React.FC<
  Readonly<{
    node: Node;
    graph: Graph;
    config?: ReadonlyMap<string, PropertyValue>;
  }>
>;

export const RENDERER_REGISTRY: ReadonlyMap<SystemRendererEntryPoint, RegistryComponent> = new Map<
  SystemRendererEntryPoint,
  RegistryComponent
>([
  ['system:text', TextBlockRenderer],
  ['system:code', CodeBlockRenderer],
  ['system:markdown', MarkdownRenderer],
]);
