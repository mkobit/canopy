import type { DeviceId } from '@canopy/graph';
import { asDeviceId, createDeviceId } from '@canopy/graph';

export const DEVICE_ID_STORAGE_KEY = 'canopy:deviceId';

/**
 * Stable per-installation device identity, generated once and persisted in the
 * browser profile. Committed events are stamped with this deviceId so LWW has a
 * real, distinct tiebreaker across devices (see the graph-session spec's
 * "Committed events carry a real device identity" requirement).
 */
export function getOrCreateDeviceId(): DeviceId {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return asDeviceId(existing);

  const deviceId = createDeviceId();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}
