import type {
  pluginLifecycle as PluginLifecycleInterface,
  contentRendering as ContentRenderingInterface,
} from 'canopy:graph/render-plugin';
import type { RenderOutput } from 'canopy:graph/content-rendering';

// Escape a raw string for safe interpolation into HTML text/attribute context.
// The host re-sanitizes with DOMPurify, but the guest never emits attacker
// markup unescaped so its own output is well-formed static HTML.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Render inline Markdown spans (code, bold, italic, links) within an already
// HTML-escaped line. Order matters: inline code first so its contents are not
// re-processed for emphasis/links.
function renderInline(escapedLine: string): string {
  return escapedLine
    .replaceAll(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`)
    .replaceAll(/\*\*([^*]+)\*\*/g, (_match, text: string) => `<strong>${text}</strong>`)
    .replaceAll(/\*([^*]+)\*/g, (_match, text: string) => `<em>${text}</em>`)
    .replaceAll(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, text: string, href: string) => `<a href="${href}">${text}</a>`,
    );
}

// Convert a Markdown document into static HTML. Supports a pragmatic Tier-1
// subset: ATX headings, fenced code blocks, unordered/ordered lists,
// blockquotes, horizontal rules, and paragraphs with inline spans. This is a
// dogfood renderer, not a spec-complete CommonMark implementation.
function markdownToHtml(markdown: string): string {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  // eslint-disable-next-line functional/prefer-readonly-type -- local HTML accumulator
  const blocks: string[] = [];

  // eslint-disable-next-line functional/no-let -- sequential line-scanner index
  let index = 0;
  // eslint-disable-next-line functional/no-let -- open paragraph accumulator
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`);
      paragraph = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith('```')) {
      flushParagraph();
      // eslint-disable-next-line functional/prefer-readonly-type -- code-line accumulator
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // consume closing fence
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Blank line ends a paragraph
    if (trimmed.length === 0) {
      flushParagraph();
      index += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push('<hr />');
      index += 1;
      continue;
    }

    // ATX heading
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1]?.length ?? 1;
      const text = renderInline(escapeHtml(headingMatch[2] ?? ''));
      blocks.push(`<h${level}>${text}</h${level}>`);
      index += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph();
      // eslint-disable-next-line functional/prefer-readonly-type -- quote-line accumulator
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${renderInline(escapeHtml(quoteLines.join(' ')))}</blockquote>`);
      continue;
    }

    // Unordered / ordered list
    const unordered = /^[-*+]\s+(.*)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const tag = ordered ? 'ol' : 'ul';
      // eslint-disable-next-line functional/prefer-readonly-type -- list-item accumulator
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = (lines[index] ?? '').trim();
        const itemMatch = ordered ? /^\d+\.\s+(.*)$/.exec(itemLine) : /^[-*+]\s+(.*)$/.exec(itemLine);
        if (!itemMatch) {
          break;
        }
        items.push(`<li>${renderInline(escapeHtml(itemMatch[1] ?? ''))}</li>`);
        index += 1;
      }
      blocks.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // Default: accumulate into paragraph
    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks.join('\n');
}

export const pluginLifecycle: typeof PluginLifecycleInterface = {
  getManifest() {
    return {
      name: 'Canopy Markdown Renderer',
      version: '1.0.0',
      description: 'First-party Tier-1 Markdown content renderer',
      capabilities: ['render:raw-html'],
      menuItems: [],
      commands: [],
    };
  },
  initialize() {
    return { tag: 'ok' as const, val: undefined };
  },
  shutdown() {
    return { tag: 'ok' as const, val: undefined };
  },
};

export const contentRendering: typeof ContentRenderingInterface = {
  render(propertiesJson: string): RenderOutput {
    // eslint-disable-next-line functional/no-let -- narrowed after parse
    let parsed: unknown;
    // eslint-disable-next-line functional/no-try-statements -- guest boundary: malformed input -> WIT error string
    try {
      parsed = JSON.parse(propertiesJson);
    } catch {
      throw new Error('render input is not valid JSON');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('render input must be a JSON object of node properties');
    }

    const content = (parsed as Record<string, unknown>)['content'];
    if (typeof content !== 'string') {
      throw new Error("render input is missing a string 'content' property");
    }

    return { html: markdownToHtml(content) };
  },
};
