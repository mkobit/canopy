import { describe, it, expect } from 'bun:test';
import { isSystemNodeId } from './system';
import { asNodeId } from './factories';

describe('isSystemNodeId', () => {
  it('identifies system node IDs correctly', () => {
    expect(isSystemNodeId(asNodeId('system:renderer:text'))).toBe(true);
    expect(isSystemNodeId(asNodeId('system:view:text-block'))).toBe(true);
    expect(isSystemNodeId(asNodeId('namespace:system'))).toBe(true);
    expect(isSystemNodeId(asNodeId('node:type:node-type'))).toBe(true);
    expect(isSystemNodeId(asNodeId('edge:type:defines'))).toBe(true);
    expect(isSystemNodeId(asNodeId('query:system:all-nodes'))).toBe(true);
    expect(isSystemNodeId(asNodeId('view:system:all-nodes'))).toBe(true);
    expect(isSystemNodeId(asNodeId('meta:renderer'))).toBe(true);
  });

  it('identifies non-system node IDs correctly', () => {
    expect(isSystemNodeId(asNodeId('user:node:123'))).toBe(false);
    expect(isSystemNodeId(asNodeId('some-other-id'))).toBe(false);
  });
});
