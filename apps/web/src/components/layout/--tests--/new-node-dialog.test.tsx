import '../../../test/setup';
import { describe, it, expect, jest, afterEach, beforeEach } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SYSTEM_IDS } from '@canopy/graph';
import { NewNodeDialog } from '../new-node-dialog';
import type { NodeTypeOption } from '../../../utils/node-types';

// Clean up before each test too, so we are not affected by DOM left over by other test files.
beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

const markdownOption: NodeTypeOption = {
  id: SYSTEM_IDS.TYPE_MARKDOWN,
  label: 'MarkdownNode',
  description: 'A node containing markdown content.',
  properties: [
    { name: 'content', valueKind: 'text', required: true, description: 'Markdown content' },
  ],
};

const codeBlockOption: NodeTypeOption = {
  id: SYSTEM_IDS.TYPE_CODE_BLOCK,
  label: 'CodeBlock',
  description: 'A block of code.',
  properties: [
    { name: 'content', valueKind: 'text', required: true, description: 'Code content' },
    {
      name: 'language',
      valueKind: 'text',
      required: false,
      description: 'Programming language',
    },
  ],
};

const textBlockOption: NodeTypeOption = {
  id: SYSTEM_IDS.TYPE_TEXT_BLOCK,
  label: 'TextBlock',
  description: 'A block of text content.',
  properties: [
    { name: 'content', valueKind: 'list', required: true, description: 'Content segments' },
  ],
};

describe('NewNodeDialog', () => {
  it('renders type options and a property field for the initial type', () => {
    render(
      <NewNodeDialog
        open={true}
        nodeTypes={[markdownOption, codeBlockOption]}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByRole('option', { name: 'MarkdownNode' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'CodeBlock' })).toBeDefined();
    // initial type is MarkdownNode → one text field rendered for `content`
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('disables Create when a required field is empty and enables it once filled', () => {
    render(
      <NewNodeDialog
        open={true}
        nodeTypes={[markdownOption]}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const createButton = screen.getByRole('button', { name: /create/i }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(createButton.disabled).toBe(false);
  });

  it('submits with selected type and entered values', () => {
    const onSubmit = jest.fn();
    render(
      <NewNodeDialog
        open={true}
        nodeTypes={[markdownOption]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(SYSTEM_IDS.TYPE_MARKDOWN, { content: 'hi' });
  });

  it('resets values when switching type', () => {
    const onSubmit = jest.fn();
    render(
      <NewNodeDialog
        open={true}
        nodeTypes={[markdownOption, codeBlockOption]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first' } });

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: SYSTEM_IDS.TYPE_CODE_BLOCK },
    });

    // After switching, CodeBlock has two text inputs — content (required, empty) + language (optional, empty)
    const textboxes = screen.getAllByRole('textbox') as readonly HTMLInputElement[];
    expect(textboxes.every((tb) => tb.value === '')).toBe(true);

    // Required content empty → Create disabled
    const createButton = screen.getByRole('button', { name: /create/i }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
  });

  it('invokes onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn();
    render(
      <NewNodeDialog
        open={true}
        nodeTypes={[markdownOption]}
        onSubmit={jest.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders an empty-state when no node types are available', () => {
    render(<NewNodeDialog open={true} nodeTypes={[]} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText(/no node types available/i)).toBeDefined();
  });

  it('submits with list value for list-typed properties (TextBlock)', () => {
    const onSubmit = jest.fn();
    render(
      <NewNodeDialog
        open={true}
        nodeTypes={[textBlockOption]}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    // Click "+ Add Item" to add an item to the list
    const addButton = screen.getByText('+ Add Item');
    fireEvent.click(addButton);

    // Now a textbox should be rendered for the list item
    const textboxes = screen.getAllByRole('textbox') as readonly HTMLInputElement[];
    expect(textboxes).toHaveLength(1);
    const firstTextbox = textboxes[0];
    expect(firstTextbox).toBeDefined();
    if (firstTextbox === undefined) return;
    fireEvent.change(firstTextbox, { target: { value: 'segment-1' } });

    // The create button should now be enabled
    const createButton = screen.getByRole('button', { name: /create/i }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(false);

    fireEvent.click(createButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(SYSTEM_IDS.TYPE_TEXT_BLOCK, {
      content: ['segment-1'],
    });
  });
});
