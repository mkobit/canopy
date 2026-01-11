import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BlockEditor } from '../BlockEditor';

describe('BlockEditor', () => {
  // Note: contentEditable is hard to test in JSDOM environment fully, but we can test rendering and basic interactions.
  it('renders initial value', () => {
    const noop = () => {}; // eslint-disable-line @typescript-eslint/no-empty-function
    render(<BlockEditor value="<b>Hello</b>" onChange={noop} />);
    // Check if innerHTML is set. screen.getByText might not match bold exactly if it parses.
    // However, text content "Hello" should be there.
    expect(screen.getByText('Hello')).toBeDefined();
  });

  // More complex tests for execCommand are tricky in JSDOM as it's not fully supported.
});
