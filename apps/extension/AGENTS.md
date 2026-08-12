# apps/extension

A capture-and-confirm-only WebExtension: it extracts inert clip data and talks native-messaging to `apps/clip-host`; it never executes page-provided code and never commits without explicit user confirmation.

## Allowed dependencies

None. This app has zero `@canopy/*` dependencies by design -- it never touches the kernel or the daemon directly, only `apps/clip-host` over the browser's native-messaging stdio protocol. `@types/chrome` and `temporal-polyfill` (types only, see below) are devDependencies.

## Forbidden

- No `eval()`, `new Function()`, or executing page-provided code -- the popup/background/content-script boundary only ever carries inert string data (see `src/content/content-script.ts`).
- No auto-capture, no background capture, no silent commit -- every clip is staged via a `draft.create`/`apply`/`preview` round trip and committed only after an explicit user confirm in the popup.
- No remote code loading (Manifest V3 forbids it anyway; don't work around it).
- No static `<all_urls>` content-script injection -- capture is programmatic (`chrome.scripting.executeScript`), triggered only by the `activeTab` grant from the user opening the popup.

## Timestamps: native `Temporal`, no runtime polyfill

This app uses the ambient `Temporal` global (assumed natively available in the target Chromium build) for `capturedAt`, consistent with the rest of the codebase banning `Date`. `temporal-polyfill` is a devDependency purely for its `temporal-polyfill/types/global` type-only export (ambient `Temporal` namespace types, zero runtime code) -- it is never imported at runtime and ships nothing into `dist/`. If a target browser turns out to lack native `Temporal`, revisit by bundling the real polyfill (would need a bundler, since `chrome://extensions` loads plain files with no module resolution beyond same-directory relative imports).

## Build and load unpacked

```bash
bun run build   # tsc -p tsconfig.build.json && copy manifest.json/popup.html into dist/
```

Then in Chrome: `chrome://extensions` -> enable Developer mode -> "Load unpacked" -> select `apps/extension/dist`. Note the extension ID Chrome assigns; it's needed for the native-messaging host manifest's `allowed_origins` (see `apps/clip-host/AGENTS.md`).

## Native-messaging host setup

The extension talks to `apps/clip-host`, not the daemon directly. Before a clip can be captured:

1. Build and install the native-messaging host manifest per `apps/clip-host/AGENTS.md`, using this extension's real (post-"Load unpacked") ID in `allowed_origins`.
2. Run `apps/daemon` (the extension's clips go nowhere without it; see `apps/daemon/AGENTS.md`).
3. Reload the extension after the host manifest is installed so `chrome.runtime.connectNative` can find it.

## Security model

See `openspec/changes/browser-extension-web-clipper/design.md`'s "Adversarial review and mitigations" section for the full analysis. Summary as it constrains this app's code:

- **User-confirmation gate.** Every clip is previewed (`draft.preview`) and requires an explicit popup confirm before `draft.commit`. Declining calls `draft.discard` and creates nothing.
- **The host narrows, not this extension.** `apps/clip-host` enforces the method allowlist and clip-namespace restriction; this extension's own discipline (no auto-capture, inert-only content, minimal permissions) is a second layer, not the enforcement boundary.
- **`activeTab` over `tabs`.** Capture happens via programmatic `chrome.scripting.executeScript` under the `activeTab` grant from the popup-opening click, not a standing `tabs`/`<all_urls>` permission.
- **Trust chain:** browser (same-user) -> `apps/clip-host` (same-user) -> daemon UDS (same-user). This extension is the least-trusted link (remotely auto-updatable, runs in the context of untrusted pages); it is bounded by the host, not by anything in this app being self-policing alone.
