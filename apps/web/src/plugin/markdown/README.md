# Markdown renderer guest plugin

## Overview

This directory implements the first-party Tier-1 Markdown renderer guest plugin for the `canopy:graph/render-plugin` WIT interface. It exposes lifecycle handlers and a pure `contentRendering.render` function that parses a JSON properties payload and converts its `content` string into escaped static HTML.

## Interface

- `[guest.ts:pluginLifecycle]` Exported object implementing `typeof PluginLifecycleInterface` with `getManifest()`, `initialize()`, and `shutdown()`.
- `[guest.ts:pluginLifecycle.getManifest]` Returns plugin manifest metadata (`name: 'Canopy Markdown Renderer'`, `version: '1.0.0'`, `capabilities: ['render:raw-html']`, empty `menuItems` and `commands`).
- `[guest.ts:pluginLifecycle.initialize]` and `[guest.ts:pluginLifecycle.shutdown]` Return `{ tag: 'ok', val: undefined }`.
- `[guest.ts:contentRendering]` Exported object implementing `typeof ContentRenderingInterface` with `render(propertiesJson: string): RenderOutput`.
- `[guest.ts:contentRendering.render]` Parses `propertiesJson` and returns `{ html: string }` rendered via `markdownToHtml`.

## Invariants

- `[guest.ts:escapeHtml]` Escapes `&`, `<`, `>`, `"`, and `'` before inline span processing or HTML block emission so raw markup is never emitted unescaped.
- `[guest.ts:renderInline]` Processes inline code (`` `...` ``) before bold (`**...**`), italic (`*...*`), and links (`[...](...)`) so code span contents are not re-processed.
- `[guest.ts:markdownToHtml]` Normalizes `\r\n` to `\n` and renders a Tier-1 subset (fenced code blocks, blank-line paragraphs, `hr`, `h1`-`h6`, blockquotes, `ul`/`ol`) without mutating external state.
- `[guest.ts:contentRendering.render]` Enforces that `propertiesJson` parses to a non-null JSON object with a string `'content'` property.

## Side Effects

- `[guest.ts:contentRendering.render]` Throws `Error('render input is not valid JSON')`, `Error('render input must be a JSON object of node properties')`, or `Error("render input is missing a string 'content' property")` on invalid input; no I/O or external state mutation.

## Verification

- Run: `bun test`
