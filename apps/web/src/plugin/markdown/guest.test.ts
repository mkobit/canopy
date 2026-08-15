import { describe, expect, it } from 'bun:test';
// Import the guest source directly (per AGENTS.md: never the transpiled
// plugin.wasm in Bun). The `canopy:graph/*` imports are type-only and erased.
import { pluginLifecycle, contentRendering } from './guest';

describe('Markdown guest plugin', () => {
  it('declares only the render:raw-html capability', () => {
    const manifest = pluginLifecycle.getManifest();
    expect(manifest.name).toBe('Canopy Markdown Renderer');
    expect(manifest.capabilities).toEqual(['render:raw-html']);
    expect(manifest.menuItems).toEqual([]);
    expect(manifest.commands).toEqual([]);
  });

  it('renders representative Markdown to static HTML', () => {
    const input = JSON.stringify({
      content: '# Title\n\nA **bold** and *italic* line with `code`.\n\n- one\n- two',
    });
    const output = contentRendering.render(input);
    expect(output.html).toContain('<h1>Title</h1>');
    expect(output.html).toContain('<strong>bold</strong>');
    expect(output.html).toContain('<em>italic</em>');
    expect(output.html).toContain('<code>code</code>');
    expect(output.html).toContain('<li>one</li>');
    expect(output.html).toContain('<li>two</li>');
  });

  it('escapes HTML in Markdown content', () => {
    const output = contentRendering.render(
      JSON.stringify({ content: 'a <script>alert(1)</script> b' }),
    );
    expect(output.html).not.toContain('<script>');
    expect(output.html).toContain('&lt;script&gt;');
  });

  it('renders fenced code blocks without inline processing', () => {
    const output = contentRendering.render(
      JSON.stringify({ content: '```\nconst x = **notbold**;\n```' }),
    );
    expect(output.html).toContain('<pre><code>');
    expect(output.html).toContain('const x = **notbold**;');
    expect(output.html).not.toContain('<strong>');
  });

  it('throws on non-JSON input', () => {
    expect(() => contentRendering.render('not json')).toThrow();
  });

  it('throws when content property is missing or non-string', () => {
    expect(() => contentRendering.render(JSON.stringify({ notContent: 1 }))).toThrow();
    expect(() => contentRendering.render(JSON.stringify({ content: 42 }))).toThrow();
  });
});
