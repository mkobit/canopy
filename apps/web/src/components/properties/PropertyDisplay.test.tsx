import '../../test/setup';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, test, describe } from 'bun:test';
import { PropertyDisplay } from './PropertyDisplay';

describe('PropertyDisplay', () => {
  test('renders string correctly', () => {
    const { container } = render(<PropertyDisplay value="Hello World" />);
    expect(screen.getByText('Hello World')).toBeTruthy();
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-gray-900');
  });

  test('renders number correctly', () => {
    const { container } = render(<PropertyDisplay value={42} />);
    expect(screen.getByText('42')).toBeTruthy();
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-blue-600');
    expect(span?.className).toContain('font-mono');
  });

  test('renders boolean true correctly', () => {
    const { container } = render(<PropertyDisplay value={true} />);
    expect(screen.getByText('TRUE')).toBeTruthy();
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-green-800');
    expect(span?.className).toContain('bg-green-100');
  });

  test('renders boolean false correctly', () => {
    const { container } = render(<PropertyDisplay value={false} />);
    expect(screen.getByText('FALSE')).toBeTruthy();
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-red-800');
    expect(span?.className).toContain('bg-red-100');
  });
});
