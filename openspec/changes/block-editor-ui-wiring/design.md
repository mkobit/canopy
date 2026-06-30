# Design: wire block-editor into node-page UI

## Overview

We will integrate the collaborative `BlockEditor` directly into the `NodePage` component.
The editor will be displayed for any node type that supports string-based `content` properties (e.g. Markdown and CodeBlock nodes).

## Detailed design

### 1. Identify text nodes on NodePage

Retrieve the Y.Text instance associated with the active `nodeId` from the `syncEngine` store:
```typescript
const ytext = useMemo(() => {
  if (!syncEngine || !nodeId) return undefined;
  let txt = syncEngine.store.texts.get(nodeId);
  if (!txt) {
    txt = new Y.Text();
    syncEngine.store.texts.set(nodeId, txt);
  }
  return txt as Y.Text;
}, [syncEngine, nodeId]);
```

Verify if the current node has a string-based `content` property:
```typescript
const hasContent = useMemo(() => {
  return currentNode?.properties.has('content') && typeof currentNode.properties.get('content') === 'string';
}, [currentNode]);
```

### 2. Properties list filtering

In properties edit mode, exclude `'content'` from the metadata properties edit inputs list to prevent editing it as a plain text scalar:
```typescript
const propertiesToEdit = useMemo(() => {
  const props = new Map(editedProps);
  props.delete('content');
  return props;
}, [editedProps]);
```

### 3. Layout updates

In [NodePage](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/pages/node-page.tsx):
- Display the [BlockEditor](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/editor/block-editor.tsx) when `hasContent` is true and `ytext` is defined.
- Place the editor above the Raw Node Data or on a prominent location on the page.
