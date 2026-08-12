// Must match `name` in apps/clip-host/native-messaging-host-manifest.template.json.
export const NATIVE_HOST_NAME = 'com.canopy.clip_host';

// Chromium's documented native-messaging cap on a single message is ~1 MB;
// stay well under it (and under the UDS server's 10 MB/line cap) since the
// wire event also carries JSON-RPC/event envelope overhead around `content`.
export const MAX_CLIP_CONTENT_BYTES = 500_000;

export const STORAGE_KEYS = {
  DEVICE_ID: 'canopy.deviceId',
  WEBCLIP_TYPE_ID: 'canopy.webClipTypeId',
} as const;
