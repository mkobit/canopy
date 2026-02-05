import { describe, it, expect, jest } from 'bun:test';
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
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
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
      </StorageProvider>,
    );
    // Wait for loading to finish or default state
    expect(await screen.findByText('Your Graphs')).toBeDefined();
  });
});
