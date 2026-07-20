import { describe, it, expect } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { StorageProvider, useStorage } from '../storage-context';
import { GraphProvider, useGraph } from '../graph-context';
import { PluginProvider, usePlugin } from '../plugin-context';
import { asGraphId, asTypeId, SYSTEM_IDS } from '@canopy/graph';
import type { NodeId, GraphId } from '@canopy/graph';
import type { ReactNode } from 'react';

function useTestContext() {
  const { eventLog, isLoading: isStorageLoading } = useStorage();
  const graphCtx = useGraph();
  const pluginCtx = usePlugin();
  return {
    storageReady: !isStorageLoading && eventLog !== null,
    graphCtx,
    pluginCtx,
  };
}

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <StorageProvider>
    <GraphProvider>
      <PluginProvider>{children}</PluginProvider>
    </GraphProvider>
  </StorageProvider>
);

describe('plugin wizard integration', () => {
  it('loads plugin manifest and executes the step-by-step wizard flow to stage and commit events', async () => {
    const testGraphId = asGraphId('test-plugin-integration-graph');
    const { result } = renderHook(() => useTestContext(), { wrapper });

    // 1. Wait for storage
    await waitFor(() => {
      expect(result.current.storageReady).toBe(true);
    });

    // 2. Load empty graph
    await act(async () => {
      const res = await result.current.graphCtx.loadGraph(testGraphId);
      expect(res.ok).toBe(true);
    });

    expect(result.current.graphCtx.graph).not.toBeNull();

    // 3. Create a Plugin node in the graph
    const mockManifest = {
      name: 'Mock Wizard Plugin',
      version: '1.0.0',
      description: 'A mock plugin for testing wizard UI flows',
      capabilities: ['wizard'],
      menuItems: [
        {
          label: 'Start Mock Wizard',
          command: 'mock-wizard:start',
          shortcut: 'Ctrl+Shift+M',
        },
      ],
      commands: [
        {
          id: 'mock-wizard:start',
          title: 'Start Mock Wizard',
          category: 'Plugins',
        },
      ],
    };

    let pluginNodeId: NodeId | undefined;
    await act(async () => {
      const res = await result.current.graphCtx.createNode(SYSTEM_IDS.TYPE_PLUGIN, {
        wasm_binary: 'AGFzbQ==',
        manifest: JSON.stringify(mockManifest),
        version: '1.0.0',
      });
      if (res.ok) pluginNodeId = res.value;
    });

    expect(pluginNodeId).toBeDefined();

    // 4. Wait for PluginProvider to scan the graph and register the plugin
    await waitFor(() => {
      expect(result.current.pluginCtx.loadedPlugins.length).toBe(1);
    });

    const loaded = result.current.pluginCtx.loadedPlugins[0];
    expect(loaded?.name).toBe('Mock Wizard Plugin');
    expect(result.current.pluginCtx.menuItems.length).toBe(1);
    expect(result.current.pluginCtx.commands.length).toBe(1);

    // 5. Trigger the wizard command
    await act(async () => {
      await result.current.pluginCtx.startWizard('mock-wizard:start');
    });

    // Verify step 1 schema
    expect(result.current.pluginCtx.activeWizard).not.toBeNull();
    const active = result.current.pluginCtx.activeWizard;
    expect(active?.stepSchema.title).toBe('Mock Step 1');
    expect(active?.stepSchema.fields.length).toBe(1);
    expect(active?.stepSchema.fields[0]?.name).toBe('name');

    // 6. Submit step 1 form
    await act(async () => {
      const step1Inputs = new Map<string, any>([['name', 'John Doe']]);
      await result.current.pluginCtx.submitWizardStep(step1Inputs);
    });

    // Verify advanced to step 2
    expect(result.current.pluginCtx.activeWizard?.stepSchema.title).toBe('Mock Step 2');
    expect(result.current.pluginCtx.activeWizard?.stepSchema.fields[0]?.name).toBe('age');

    // 7. Submit step 2 form (this finishes the wizard)
    await act(async () => {
      const step2Inputs = new Map<string, any>([['age', 42]]);
      await result.current.pluginCtx.submitWizardStep(step2Inputs);
    });

    // Verify wizard is completed (nullified)
    expect(result.current.pluginCtx.activeWizard).toBeNull();

    // Verify that the output node was created in the parent graph
    const finalGraph = result.current.graphCtx.graph;
    expect(finalGraph).not.toBeNull();
    const outputNode = finalGraph?.nodes.get('node_mock_plugin_output' as NodeId);
    expect(outputNode).toBeDefined();
    expect(outputNode?.type).toBe(asTypeId('mock_output'));
    expect(outputNode?.properties.get('age')).toBe(42);
  });
});
