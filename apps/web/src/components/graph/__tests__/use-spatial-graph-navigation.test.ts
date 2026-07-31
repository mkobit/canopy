import { describe, it, expect, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import type { NavigationNode } from '../use-spatial-graph-navigation';
import { useSpatialGraphNavigation } from '../use-spatial-graph-navigation';

function createMockKeyboardEvent(
  overrides: Readonly<Partial<React.KeyboardEvent<HTMLElement>>> = {},
): React.KeyboardEvent<HTMLElement> {
  let isPrevented = overrides.defaultPrevented ?? false;
  const preventDefault = mock(() => {
    isPrevented = true;
  });

  const eventTarget = overrides.target ?? document.createElement('div');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Mocking React event object for hook unit test
  return {
    key: '',
    target: eventTarget,
    get defaultPrevented() {
      return isPrevented;
    },
    preventDefault,
    ...overrides,
  } as unknown as React.KeyboardEvent<HTMLElement>;
}

describe('useSpatialGraphNavigation', () => {
  const nodes: readonly NavigationNode[] = [
    { id: 'center', position: { x: 0, y: 0 } },
    { id: 'right-near', position: { x: 50, y: 0 } },
    { id: 'right-far', position: { x: 100, y: 0 } },
    { id: 'left', position: { x: -100, y: 0 } },
    { id: 'down', position: { x: 0, y: 100 } },
    { id: 'up', position: { x: 0, y: -100 } },
  ];

  it('navigates ArrowRight to nearest candidate node in positive X direction', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'center',
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'ArrowRight' });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith('right-near');
  });

  it('navigates ArrowLeft to candidate node in negative X direction', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'center',
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'ArrowLeft' });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith('left');
  });

  it('navigates ArrowDown to candidate node in positive Y direction', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'center',
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'ArrowDown' });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith('down');
  });

  it('navigates ArrowUp to candidate node in negative Y direction', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'center',
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'ArrowUp' });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith('up');
  });

  it('deselects active node on Escape key', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'center',
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'Escape' });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith(undefined);
  });

  it('selects first node when arrow pressed with no active selection', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: undefined,
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'ArrowRight' });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith('center');
  });

  it('selects first node when active selection is not in node list', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'non-existent',
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'ArrowRight' });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith('center');
  });

  it('ignores key events on input, textarea, and contentEditable elements', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'center',
        onSelectNode,
      }),
    );

    const input = document.createElement('input');
    const inputEvent = createMockKeyboardEvent({ key: 'ArrowRight', target: input });
    act(() => {
      result.current.handleKeyDown(inputEvent);
    });
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(onSelectNode).not.toHaveBeenCalled();

    const textarea = document.createElement('textarea');
    const textareaEvent = createMockKeyboardEvent({ key: 'Escape', target: textarea });
    act(() => {
      result.current.handleKeyDown(textareaEvent);
    });
    expect(textareaEvent.preventDefault).not.toHaveBeenCalled();
    expect(onSelectNode).not.toHaveBeenCalled();

    const editableDiv = document.createElement('div');
    editableDiv.contentEditable = 'true';
    const editableEvent = createMockKeyboardEvent({ key: 'ArrowDown', target: editableDiv });
    act(() => {
      result.current.handleKeyDown(editableEvent);
    });
    expect(editableEvent.preventDefault).not.toHaveBeenCalled();
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('ignores defaultPrevented events', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'center',
        onSelectNode,
      }),
    );

    const event = createMockKeyboardEvent({ key: 'ArrowRight', defaultPrevented: true });
    act(() => {
      result.current.handleKeyDown(event);
    });

    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('performs safe no-op on empty node list', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock handler
    const onSelectNode = mock(() => {});
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes: [],
        selectedNodeId: undefined,
        onSelectNode,
      }),
    );

    const arrowEvent = createMockKeyboardEvent({ key: 'ArrowRight' });
    act(() => {
      result.current.handleKeyDown(arrowEvent);
    });

    expect(onSelectNode).not.toHaveBeenCalled();

    const escapeEvent = createMockKeyboardEvent({ key: 'Escape' });
    act(() => {
      result.current.handleKeyDown(escapeEvent);
    });

    expect(escapeEvent.preventDefault).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith(undefined);
  });
});
