# Proposal: wire block-editor into node-page UI

## Why

The collaborative [BlockEditor](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/editor/block-editor.tsx) is currently built and tested but not integrated into the user interface.
To enable collaborative editing in Canopy:

1. Users need a way to edit node text/markdown content directly using the rich-text block editor.
2. Standard properties lists should not expose the raw text content as a plain one-line input field.
3. Node page views should reactively display the rendered document layout while editing content.

## What changes

- Add [BlockEditor](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/editor/block-editor.tsx) component to the [NodePage](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/pages/node-page.tsx) layout when editing a node with a `content` property.
- Strip the `content` property from the default metadata/properties list on the node page.
- Retain the editor as a real-time collaborative element in the node details layout.

## Capabilities

### Modified capabilities

- `ui-node-editing`: Node text content is editable collaboratively using the block editor component.

## Impact

- `apps/web/src/pages/node-page.tsx` — render the block editor and exclude the `content` property from metadata editing.
