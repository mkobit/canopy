import { describe, it, expect } from 'bun:test';
import { hasNoTauriIpcSurface, TAURI_IPC_SURFACE_GLOBALS } from './native-shell-hardening';

describe('native-shell IPC-surface hardening', () => {
  it('checks __TAURI_INTERNALS__ explicitly, not only __TAURI__ (finding 12)', () => {
    expect(TAURI_IPC_SURFACE_GLOBALS).toContain('__TAURI_INTERNALS__');
    expect(TAURI_IPC_SURFACE_GLOBALS).toContain('__TAURI__');
    expect(TAURI_IPC_SURFACE_GLOBALS).toContain('ipc');
  });

  it('reports no Tauri IPC surface on a clean host window (Tauri not wired)', () => {
    expect(hasNoTauriIpcSurface(globalThis)).toBe(true);
  });

  it('detects the internals object even when the convenience global is absent', () => {
    const scopeWithInternalsOnly = { __TAURI_INTERNALS__: { postMessage: () => undefined } };
    expect(hasNoTauriIpcSurface(scopeWithInternalsOnly)).toBe(false);
  });

  it('passes for a scope with none of the IPC-surface globals', () => {
    expect(hasNoTauriIpcSurface({ unrelated: 1 })).toBe(true);
  });
});
