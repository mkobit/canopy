import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { StorageProvider } from './context/StorageContext';
import { GraphProvider } from './context/GraphContext';
import 'fake-indexeddb/auto';

// Mock matchMedia for testing-library
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('HomePage', () => {
  it('renders "Your Graphs"', async () => {
    render(
      <StorageProvider>
        <GraphProvider>
            <BrowserRouter>
              <HomePage />
            </BrowserRouter>
        </GraphProvider>
      </StorageProvider>
    );
    // Wait for loading to finish or default state
    expect(await screen.findByText('Your Graphs')).toBeDefined();
  });
});
