import { describe, it, expect } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { StorageProvider, useStorage } from '../storage-context';
import { GraphProvider, useGraph } from '../graph-context';
import { asGraphId, SYSTEM_IDS } from '@canopy/graph';
import type { NodeId } from '@canopy/graph';
import type { ReactNode } from 'react';

function useTestContext() {
  const { storage, isLoading: storageLoading } = useStorage();
  const graphCtx = useGraph();
  return { storageReady: !storageLoading && storage !== null, ...graphCtx };
}

const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <StorageProvider>
    <GraphProvider>{children}</GraphProvider>
  </StorageProvider>
);

describe('graph round-trip', () => {
  it('persists a node through save and load', async () => {
    const testGraphId = asGraphId('test-graph-integration');

    const { result, unmount } = renderHook(() => useTestContext(), { wrapper });

    // Wait for storage to initialize
    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    // Load an empty graph
    await act(async () => {
      const res = await result.current.loadGraph(testGraphId);
      expect(res.ok).toBe(true);
    });

    expect(result.current.graph).not.toBeNull();

    // Create a node — createNode auto-saves
    let nodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.createNode(SYSTEM_IDS.TYPE_MARKDOWN, {
        content: 'hello',
      });
      if (res.ok) nodeId = res.value;
    });

    expect(nodeId).toBeDefined();
    if (nodeId === undefined) return;

    expect(result.current.graph?.nodes.has(nodeId)).toBe(true);
    expect(result.current.graph?.nodes.get(nodeId)?.properties.get('content')).toBe('hello');

    // Simulate page reload — unmount providers and remount fresh
    unmount();
    const { result: result2 } = renderHook(() => useTestContext(), { wrapper });

    await waitFor(() => {
      expect(result2.current.storageReady).toBe(true);
    });

    await act(async () => {
      const res = await result2.current.loadGraph(testGraphId);
      expect(res.ok).toBe(true);
    });

    expect(result2.current.graph?.nodes.has(nodeId)).toBe(true);
  });
});
