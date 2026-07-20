import '../../../test/setup';
import { describe, it, expect, mock, afterEach, beforeEach } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../command-palette';
import { SYSTEM_IDS, createNodeId, createInstant, asGraphId, asDeviceId } from '@canopy/graph';
import type { Graph, Node } from '@canopy/graph';

const mockNavigate = mock(() => undefined);
const mockStartWizard = mock(async () => undefined);

const mockCommands = [
  { id: 'cmd-1', title: 'Create Daily Note', category: 'vault' },
  { id: 'cmd-2', title: 'Open Settings', category: 'system' },
];

const mockNode1: Node = {
  id: createNodeId(),
  type: SYSTEM_IDS.TYPE_MARKDOWN,
  properties: new Map([
    ['name', 'Project Alpha'],
    ['content', 'Draft content.'],
  ]),
  metadata: { created: createInstant(), modified: createInstant(), modifiedBy: asDeviceId('dev-1') },
};

const mockNode2: Node = {
  id: createNodeId(),
  type: SYSTEM_IDS.TYPE_CODE_BLOCK,
  properties: new Map([
    ['name', 'Project Beta'],
    ['content', 'console.log("test");'],
  ]),
  metadata: { created: createInstant(), modified: createInstant(), modifiedBy: asDeviceId('dev-1') },
};

const mockGraph: Graph = {
  id: asGraphId('test-graph-id'),
  name: 'Test Graph',
  metadata: { created: createInstant(), modified: createInstant(), modifiedBy: asDeviceId('dev-1') },
  nodes: new Map([
    [mockNode1.id, mockNode1],
    [mockNode2.id, mockNode2],
  ]),
  edges: new Map(),
};

// Mock modules native to Bun
mock.module('../../../context/plugin-context', () => {
  return {
    usePlugin: () => ({
      commands: mockCommands,
      startWizard: mockStartWizard,
    }),
  };
});

mock.module('../../../context/graph-context', () => {
  return {
    useGraph: () => ({
      graph: mockGraph,
    }),
  };
});

mock.module('react-router-dom', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- actual module loading requires require inside Bun mock
  const actual = require('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ graphId: 'test-graph-id' }),
  };
});

mock.module('@canopy/queries', () => {
  return {
    executeStoredQuery: (graph: Graph, queryId: string) => {
      if (queryId === SYSTEM_IDS.QUERY_ALL_NODES) {
        return {
          ok: true,
          value: {
            nodes: [...graph.nodes.values()],
          },
        };
      }
      return { ok: false, error: new Error('Query not found') };
    },
  };
});

describe('CommandPalette', () => {
  beforeEach(() => {
    cleanup();
    mockNavigate.mockClear();
    mockStartWizard.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('is closed by default and opens on Ctrl+P in Node Search mode', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    expect(screen.queryByPlaceholderText('Search nodes...')).toBeNull();

    // Trigger Ctrl+P.
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    expect(screen.getByPlaceholderText('Search nodes...')).toBeDefined();
  });

  it('opens on Ctrl+Shift+P in Command mode with prefix', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    // Trigger Ctrl+Shift+P.
    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true });

    const input = screen.getByPlaceholderText('Type a command to run...') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('>');
  });

  it('switches modes dynamically when typing or deleting prefix', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    // Open in node search.
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    const input = screen.getByPlaceholderText('Search nodes...') as HTMLInputElement;
    expect(input).toBeDefined();

    // Type ">" to switch to Command mode.
    fireEvent.change(input, { target: { value: '>' } });
    expect(screen.getByPlaceholderText('Type a command to run...')).toBeDefined();

    // Delete ">" to switch back to Node Search mode.
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByPlaceholderText('Search nodes...')).toBeDefined();
  });

  it('filters nodes in Node Search mode', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    // Open in node search.
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    const input = screen.getByPlaceholderText('Search nodes...') as HTMLInputElement;

    // Initially lists all nodes when query is empty.
    expect(screen.getByText('Project Alpha')).toBeDefined();
    expect(screen.getByText('Project Beta')).toBeDefined();

    // Filter to Beta.
    fireEvent.change(input, { target: { value: 'Beta' } });
    expect(screen.queryByText('Project Alpha')).toBeNull();
    expect(screen.getByText('Project Beta')).toBeDefined();
  });

  it('filters commands in Command mode', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    // Open in command mode.
    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true });

    const input = screen.getByPlaceholderText('Type a command to run...') as HTMLInputElement;

    // Filters commands.
    expect(screen.getByText('Create Daily Note')).toBeDefined();
    expect(screen.getByText('Open Settings')).toBeDefined();

    // Filter.
    fireEvent.change(input, { target: { value: '>Settings' } });
    expect(screen.queryByText('Create Daily Note')).toBeNull();
    expect(screen.getByText('Open Settings')).toBeDefined();
  });

  it('navigates when node is confirmed', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    // Open in node search.
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    // Select the first node (Project Alpha).
    const itemButton = screen.getByText('Project Alpha');
    fireEvent.click(itemButton);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(`/graph/test-graph-id/node/${mockNode1.id}`);
  });
});
