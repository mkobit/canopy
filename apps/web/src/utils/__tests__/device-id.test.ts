import { describe, it, expect, beforeEach } from 'bun:test';
import { getOrCreateDeviceId, DEVICE_ID_STORAGE_KEY } from '../device-id';

describe('getOrCreateDeviceId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates and persists a deviceId on first call', () => {
    const deviceId = getOrCreateDeviceId();
    expect(deviceId).toBeTruthy();
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(deviceId);
  });

  it('returns the same deviceId on subsequent calls', () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(second).toBe(first);
  });

  it('never returns the placeholder zero deviceId', () => {
    const deviceId = getOrCreateDeviceId();
    expect(deviceId).not.toBe('00000000-0000-0000-0000-000000000000');
  });
});
