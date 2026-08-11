# apps/clip-host

A same-user native-messaging host that relays an allowlisted set of clip requests from the browser extension to the daemon's Unix-socket JSON-RPC surface; it is a narrowing proxy, not a transparent one, and opens no network socket.

## Allowed dependencies

`@canopy/api-adapter`, `@canopy/graph`.
External: `effect`.

## Forbidden

- No TCP or network-listening socket of any kind -- native-messaging stdio to the browser, Unix domain socket to the daemon, nothing else.
- No unrestricted proxying: every relayed method must be checked against the allowlist in `src/allowlist.ts` before it reaches the daemon.
- No React, no browser globals -- this is a Node/Bun process launched by the browser, not extension code.
- Use Effect for I/O and error handling, not throw/try-catch.

## Native-messaging host manifest

`native-messaging-host-manifest.template.json` is the Chromium manifest template (`type: stdio`, `allowed_origins` pinned to the blessed extension ID). Firefox uses `allowed_extensions` (a list of extension IDs) instead of `allowed_origins` -- not templated here since the first target is a Chromium MV3 build (see design.md Non-Goals).

To install: fill in the absolute `path` to the built `canopy-clip-host` binary and the real extension ID, then copy the file into the browser's native-messaging-hosts directory under the manifest's own `name` (`com.canopy.clip_host.json`) -- e.g. `~/.config/google-chrome/NativeMessagingHosts/` on Linux, `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` on macOS. The extension ID is only known once `apps/extension` (`canopy-2nn.2`) is built and loaded.
