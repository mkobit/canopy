import { describe, it, expect, jest } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyDisplay } from '../PropertyDisplay';
import { PropertyInput } from '../PropertyInput';

describe('PropertyDisplay', () => {
  it('renders text value', () => {
    const value = 'Hello World';
    render(<PropertyDisplay value={value} />);
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('renders number value', () => {
    const value = 42;
    render(<PropertyDisplay value={value} />);
    expect(screen.getByText('42')).toBeDefined();
  });
});

describe('PropertyInput', () => {
  it('updates text value', () => {
    const value = 'Initial';
    const onChange = jest.fn();
    render(<PropertyInput value={value} onChange={onChange} kind="text" />);

    const input = screen.getByDisplayValue('Initial');
    fireEvent.change(input, { target: { value: 'Updated' } });

    expect(onChange).toHaveBeenCalledWith('Updated');
  });

  it('updates number value', () => {
    const value = 10;
    const onChange = jest.fn();
    render(<PropertyInput value={value} onChange={onChange} kind="number" />);

    const input = screen.getByDisplayValue('10');
    fireEvent.change(input, { target: { value: '20' } });

    expect(onChange).toHaveBeenCalledWith(20);
  });
});
