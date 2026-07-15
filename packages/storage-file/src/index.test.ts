import { expect, test } from 'bun:test';
import { version } from './index';

test('should export the version', () => {
  expect(version).toBe('0.0.0');
});
