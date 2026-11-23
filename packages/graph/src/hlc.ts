import type { ActorId, DeviceId } from './identifiers';
import type { Instant } from './temporal';
import type { Result } from './result';
import { err as error, ok } from './result';

export declare const hlcTimestampBrand: unique symbol;

/**
Hybrid Logical Clock timestamp string: `<physicalMs>:<counter>:<actorId>`.
Canonical generated values zero-pad `physicalMs` to 13 digits and `counter` to 6 digits.
*/
export type HlcTimestamp = string & Readonly<{ [hlcTimestampBrand]: never }>;

export type ActorKind = 'user' | 'agent' | 'plugin' | 'workflow';

export const DEFAULT_HLC_MAX_DRIFT_MS = 60_000;

const HLC_PATTERN = /^(\d{1,16}):(\d{1,10}):(.+)$/;

interface ParsedHlc {
  readonly physicalMs: number;
  readonly counter: number;
  readonly actorId: string;
}

function parseHlcTimestamp(raw: string): Result<ParsedHlc, Error> {
  const match = HLC_PATTERN.exec(raw);
  if (!match) {
    return error(new Error(`Invalid HLC timestamp format: ${raw}`));
  }
  const [, msPart, counterPart, actorId] = match;
  if (!msPart || !counterPart || !actorId) {
    return error(new Error(`Invalid HLC timestamp format: ${raw}`));
  }
  const physicalMs = Number(msPart);
  const counter = Number(counterPart);
  return Number.isSafeInteger(physicalMs) && Number.isSafeInteger(counter)
    ? ok({ physicalMs, counter, actorId })
    : error(new Error(`HLC timestamp components out of safe integer range: ${raw}`));
}

export function isValidHlcTimestamp(raw: string): raw is HlcTimestamp {
  return parseHlcTimestamp(raw).ok;
}

export function formatHlcTimestamp(
  physicalMs: number,
  counter: number,
  actorId: string,
): HlcTimestamp {
  const ms = String(Math.max(0, Math.trunc(physicalMs))).padStart(13, '0');
  const cnt = String(Math.max(0, Math.trunc(counter))).padStart(6, '0');
  return `${ms}:${cnt}:${actorId}` as HlcTimestamp;
}

export function asHlcTimestamp(raw: string): Result<HlcTimestamp, Error> {
  const parsed = parseHlcTimestamp(raw);
  return parsed.ok ? ok(raw as HlcTimestamp) : parsed;
}

/**
Synthesizes a deterministic HLC timestamp from a legacy `(Instant, DeviceId)` pair
so LWW comparisons remain total and transitive across legacy and HLC-stamped events.
*/
export function synthesizeLegacyHlc(timestamp: Instant, deviceId: DeviceId): HlcTimestamp {
  const epochMs = Temporal.Instant.from(timestamp).epochMilliseconds;
  return formatHlcTimestamp(epochMs, 0, deviceId);
}

/**
Structurally compares two HLC timestamps by `(physicalMs, counter, actorId)`.
*/
export function compareHlcTimestamp(a: HlcTimestamp, b: HlcTimestamp): -1 | 0 | 1 {
  const parsedA = parseHlcTimestamp(a);
  const parsedB = parseHlcTimestamp(b);
  if (!parsedA.ok || !parsedB.ok) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  const left = parsedA.value;
  const right = parsedB.value;
  if (left.physicalMs !== right.physicalMs) {
    return left.physicalMs < right.physicalMs ? -1 : 1;
  }
  if (left.counter !== right.counter) {
    return left.counter < right.counter ? -1 : 1;
  }
  if (left.actorId === right.actorId) return 0;
  return left.actorId < right.actorId ? -1 : 1;
}

export interface HlcClockOptions {
  readonly nowMs?: (() => number) | undefined;
  readonly maxDriftMs?: number | undefined;
}

export interface HlcClock {
  readonly tick: () => HlcTimestamp;
  readonly receive: (remote: HlcTimestamp) => Result<HlcTimestamp, Error>;
  readonly last: () => HlcTimestamp | undefined;
}

/**
Creates a monotonic Hybrid Logical Clock bound to `actorId`.
Uses internal cell state so no `let` or direct array/object mutation is exposed.
*/
export function createHlcClock(actorId: ActorId, options?: HlcClockOptions): HlcClock {
  const nowMs = options?.nowMs ?? (() => Temporal.Now.instant().epochMilliseconds);
  const maxDriftMs = options?.maxDriftMs ?? DEFAULT_HLC_MAX_DRIFT_MS;
  const stateCell = {
    current: undefined as
      Readonly<{ physicalMs: number; counter: number; formatted: HlcTimestamp }> | undefined,
  };

  const tick = (): HlcTimestamp => {
    const physicalNow = Math.max(0, Math.trunc(nowMs()));
    const previous = stateCell.current;
    const nextPhysicalMs = previous ? Math.max(physicalNow, previous.physicalMs) : physicalNow;
    const nextCounter =
      previous && nextPhysicalMs === previous.physicalMs ? previous.counter + 1 : 0;
    const formatted = formatHlcTimestamp(nextPhysicalMs, nextCounter, actorId);
    stateCell.current = { physicalMs: nextPhysicalMs, counter: nextCounter, formatted };
    return formatted;
  };

  const receive = (remote: HlcTimestamp): Result<HlcTimestamp, Error> => {
    const parsed = parseHlcTimestamp(remote);
    if (!parsed.ok) return parsed;

    const physicalNow = Math.max(0, Math.trunc(nowMs()));
    const remotePhysicalMs = parsed.value.physicalMs;
    const remoteCounter = parsed.value.counter;

    if (Number.isFinite(maxDriftMs) && remotePhysicalMs - physicalNow > maxDriftMs) {
      return error(
        new Error(
          `HLC remote timestamp exceeds maxDriftMs (${remotePhysicalMs - physicalNow} > ${maxDriftMs})`,
        ),
      );
    }

    const previous = stateCell.current;
    const previousPhysicalMs = previous?.physicalMs ?? 0;
    const previousCounter = previous?.counter ?? 0;
    const nextPhysicalMs = Math.max(physicalNow, previousPhysicalMs, remotePhysicalMs);

    const nextCounter = ((): number => {
      if (nextPhysicalMs === previousPhysicalMs && nextPhysicalMs === remotePhysicalMs) {
        return Math.max(previousCounter, remoteCounter) + 1;
      }
      if (nextPhysicalMs === previousPhysicalMs) {
        return previousCounter + 1;
      }
      return nextPhysicalMs === remotePhysicalMs ? remoteCounter + 1 : 0;
    })();

    const formatted = formatHlcTimestamp(nextPhysicalMs, nextCounter, actorId);
    stateCell.current = { physicalMs: nextPhysicalMs, counter: nextCounter, formatted };
    return ok(formatted);
  };

  const last = (): HlcTimestamp | undefined => stateCell.current?.formatted;

  return { tick, receive, last };
}
