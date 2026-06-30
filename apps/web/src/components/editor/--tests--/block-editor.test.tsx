import '../../../test/setup';
import { describe, it, expect } from 'bun:test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BlockEditor } from '../block-editor';
import * as Y from 'yjs';

describe('BlockEditor', () => {
  it('renders initial value from Y.Text', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('test');
    ytext.insert(0, '<b>Hello</b>');

    render(<BlockEditor ytext={ytext} />);
    expect(screen.getAllByText('Hello').length).toBeGreaterThan(0);
  });
});
