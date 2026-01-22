import { describe, it, expect } from 'vitest';
import { API_VERSION } from './index';

describe('API', () => {
  it('exports a version', () => {
    expect(API_VERSION).toBeDefined();
  });
});
