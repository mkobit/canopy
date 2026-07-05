import '../../../test/setup';
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BlockEditor } from '../block-editor';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Clean up before each test too, so we are not affected by DOM left over by other test files.
beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe('BlockEditor', () => {
  it('renders the initial value', () => {
    render(<BlockEditor value="Hello" onCommit={mock()} />);
    expect(screen.getAllByText('Hello').length).toBeGreaterThan(0);
  });

  it('commits once after the idle debounce elapses following an edit', async () => {
    const onCommit = mock();
    render(<BlockEditor value="Hello" onCommit={onCommit} idleMs={10} />);

    const editor = screen.getByText('Hello');
    editor.textContent = 'Hello world';
    fireEvent.input(editor);

    expect(onCommit).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
    expect(onCommit).toHaveBeenCalledWith('Hello world');
  });

  it('coalesces continuous typing into a single commit', async () => {
    const onCommit = mock();
    render(<BlockEditor value="Hello" onCommit={onCommit} idleMs={20} />);

    const editor = screen.getByText('Hello');
    editor.textContent = 'Hello w';
    fireEvent.input(editor);
    await sleep(5);
    editor.textContent = 'Hello wo';
    fireEvent.input(editor);
    await sleep(5);
    editor.textContent = 'Hello world';
    fireEvent.input(editor);

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
    expect(onCommit).toHaveBeenCalledWith('Hello world');
  });

  it('commits immediately on blur without waiting for the idle debounce', () => {
    const onCommit = mock();
    render(<BlockEditor value="Hello" onCommit={onCommit} idleMs={10_000} />);

    const editor = screen.getByText('Hello');
    editor.textContent = 'Hello world';
    fireEvent.input(editor);
    fireEvent.blur(editor);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Hello world');
  });

  it('flushes a pending edit on unmount', () => {
    const onCommit = mock();
    const { unmount } = render(<BlockEditor value="Hello" onCommit={onCommit} idleMs={10_000} />);

    const editor = screen.getByText('Hello');
    editor.textContent = 'Hello world';
    fireEvent.input(editor);

    unmount();

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Hello world');
  });

  it('does not commit on blur or unmount when nothing changed', () => {
    const onCommit = mock();
    const { unmount } = render(<BlockEditor value="Hello" onCommit={onCommit} idleMs={10_000} />);

    const editor = screen.getByText('Hello');
    fireEvent.blur(editor);
    unmount();

    expect(onCommit).not.toHaveBeenCalled();
  });
});
