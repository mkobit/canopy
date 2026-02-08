import 'fake-indexeddb/auto';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { mock } from 'bun:test';

GlobalRegistrator.register();

// Mock matchMedia for testing-library
globalThis.matchMedia = mock((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: mock(), // deprecated
  removeListener: mock(), // deprecated
  addEventListener: mock(),
  removeEventListener: mock(),
  dispatchEvent: mock(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
})) as any;
