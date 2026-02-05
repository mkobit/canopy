import { describe, it, expect } from 'bun:test';
import { API_VERSION } from './index';

describe('API', () => {
  it('exports a version', () => {
    expect(API_VERSION).toBeDefined();
  });
});
