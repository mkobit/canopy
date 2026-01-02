import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyDisplay } from '../PropertyDisplay.js';
import { PropertyInput } from '../PropertyInput.js';
import { PropertyValue, TextValue, NumberValue } from '@canopy/types';

describe('PropertyDisplay', () => {
  it('renders text value', () => {
    const value: TextValue = { kind: 'text', value: 'Hello World' };
    render(<PropertyDisplay value={value} />);
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('renders number value', () => {
    const value: NumberValue = { kind: 'number', value: 42 };
    render(<PropertyDisplay value={value} />);
    expect(screen.getByText('42')).toBeDefined();
  });
});

describe('PropertyInput', () => {
  it('updates text value', () => {
    const value: TextValue = { kind: 'text', value: 'Initial' };
    const onChange = vi.fn();
    render(<PropertyInput value={value} onChange={onChange} />);

    const input = screen.getByDisplayValue('Initial');
    fireEvent.change(input, { target: { value: 'Updated' } });

    expect(onChange).toHaveBeenCalledWith({ kind: 'text', value: 'Updated' });
  });

  it('updates number value', () => {
    const value: NumberValue = { kind: 'number', value: 10 };
    const onChange = vi.fn();
    render(<PropertyInput value={value} onChange={onChange} />);

    const input = screen.getByDisplayValue('10');
    fireEvent.change(input, { target: { value: '20' } });

    expect(onChange).toHaveBeenCalledWith({ kind: 'number', value: 20 });
  });
});
