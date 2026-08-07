import { describe, expect, test } from 'bun:test';
import { JSON_RPC_IPC_SPECIFICATION } from '../src';

describe('OpenRPC Specification Export', () => {
  test('exports valid JSON-RPC 2.0 OpenRPC specification JSON string', () => {
    expect(typeof JSON_RPC_IPC_SPECIFICATION).toBe('string');
    const parsed = JSON.parse(JSON_RPC_IPC_SPECIFICATION) as {
      readonly openrpc: string;
      readonly methods: readonly { readonly name: string }[];
      readonly errors: readonly { readonly code: number }[];
    };
    expect(parsed.openrpc).toBe('1.3.2');
    expect(parsed.methods.some((m) => m.name === 'canopy.v1.query.getNode')).toBe(true);
    expect(parsed.errors.some((error) => error.code === -32_000)).toBe(true);
  });
});
