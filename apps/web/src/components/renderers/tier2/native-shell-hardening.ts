// Native-shell (Tauri) IPC-surface hardening invariant (design decision 8 /
// finding 12). Canopy is a web SPA today; Tauri is deferred (local-app-delivery
// ADR). When it lands, `withGlobalTauri: false` alone is NOT sufficient: Tauri v2
// IPC is also reachable via `window.__TAURI_INTERNALS__.postMessage`, the
// `ipc://`/custom-protocol path, and init scripts whose subframe-injection scope
// is config-dependent.
//
// REQUIRED CONFIG INVARIANT (enforced when Tauri is wired):
//   1. No Tauri IPC surface — `__TAURI__`, `__TAURI_INTERNALS__`, `window.ipc`,
//      or a reachable custom-protocol handler — is present in a render frame.
//   2. Initialization scripts are NOT injected into untrusted subframes.
//   3. Native access stays gated behind the capability manifest, never a global.
//
// This lands as a documented invariant plus the guard below (Tauri is not yet
// wired, so it asserts absence, not a running integration). The Tier-2 frame is
// an opaque-origin sandbox with no `allow-same-origin`, so it can never reach a
// host-window global regardless — this guard defends the HOST window contract.

// The IPC-surface globals a render frame must never expose. `__TAURI_INTERNALS__`
// is listed explicitly because dropping only the `__TAURI__` convenience global
// leaves the internals object reachable (finding 12).
export const TAURI_IPC_SURFACE_GLOBALS = ['__TAURI__', '__TAURI_INTERNALS__', 'ipc'] as const;

// Returns true iff no Tauri IPC-surface global is present on the given scope.
export const hasNoTauriIpcSurface = (scope: object): boolean =>
  TAURI_IPC_SURFACE_GLOBALS.every((name) => Reflect.get(scope, name) === undefined);
