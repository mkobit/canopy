import { describe, expect, test } from 'bun:test';
import {
  asActorId,
  asDeviceId,
  asHlcTimestamp,
  asInstant,
  compareHlcTimestamp,
  createHlcClock,
  isValidHlcTimestamp,
  synthesizeLegacyHlc,
} from './index';

describe('hlc', () => {
  test('tick remains monotonic even when physical clock jumps backward', () => {
    const nowCell = { current: 1_700_000_000_000 };
    const clock = createHlcClock(asActorId('actor:alice'), { nowMs: () => nowCell.current });

    const first = clock.tick();
    const second = clock.tick();
    nowCell.current = 1_699_999_999_000;
    const third = clock.tick();

    expect(compareHlcTimestamp(first, second)).toBe(-1);
    expect(compareHlcTimestamp(second, third)).toBe(-1);
    expect(clock.last()).toBe(third);
  });

  test('receive advances clock above remote timestamp and rejects excessive forward drift', () => {
    const clock = createHlcClock(asActorId('actor:bob'), {
      nowMs: () => 1_700_000_000_000,
      maxDriftMs: 5000,
    });

    const nearRemote = asHlcTimestamp('1700000002000:000003:actor:alice');
    expect(nearRemote.ok).toBe(true);
    if (!nearRemote.ok) return;

    const merged = clock.receive(nearRemote.value);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(compareHlcTimestamp(nearRemote.value, merged.value)).toBe(-1);

    const farFuture = asHlcTimestamp('1700000010000:000000:actor:mallory');
    expect(farFuture.ok).toBe(true);
    if (!farFuture.ok) return;

    const rejected = clock.receive(farFuture.value);
    expect(rejected.ok).toBe(false);
  });

  test('parses colon-containing actorIds and legacy unpadded counters structurally', () => {
    expect(isValidHlcTimestamp('1700000000000:0:alice')).toBe(true);
    expect(isValidHlcTimestamp('1700000000000:000010:actor:alice:1')).toBe(true);
    expect(isValidHlcTimestamp('not-an-hlc')).toBe(false);

    const a = asHlcTimestamp('1700000000000:2:alice');
    const b = asHlcTimestamp('1700000000000:10:alice');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(compareHlcTimestamp(a.value, b.value)).toBe(-1);
    expect(compareHlcTimestamp(b.value, a.value)).toBe(1);
    expect(compareHlcTimestamp(a.value, a.value)).toBe(0);
  });

  test('synthesizeLegacyHlc orders deterministically by timestamp then deviceId', () => {
    const deviceA = asDeviceId('0192b1a0-0000-7000-8000-000000000001');
    const deviceB = asDeviceId('0192b1a0-0000-7000-8000-000000000002');
    const t1 = asInstant('2026-01-01T00:00:00.000Z');
    const t2 = asInstant('2026-01-01T00:00:01.000Z');

    expect(
      compareHlcTimestamp(synthesizeLegacyHlc(t1, deviceA), synthesizeLegacyHlc(t1, deviceB)),
    ).toBe(-1);
    expect(
      compareHlcTimestamp(synthesizeLegacyHlc(t1, deviceB), synthesizeLegacyHlc(t2, deviceA)),
    ).toBe(-1);
  });
});
