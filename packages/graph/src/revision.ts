import type { EventId, Revision } from './identifiers';

const ZERO_REVISION = '00000000-0000-0000-0000-000000000000' as Revision;

const MASK64 = 0xff_ff_ff_ff_ff_ff_ff_ffn;
const MASK_122 = (1n << 122n) - 1n;
const PRIME1 = 0xff_51_af_d7_ed_55_8c_cdn;
const PRIME2 = 0xc4_ce_b9_fe_1a_85_ec_53n;
const HEX_32_REGEX = /^[0-9a-fA-F]{32}$/;

// Trusted cast for already-known-good values, mirroring the other `as*` casters in factories.ts.
export function asRevision(value: string): Revision {
  return value as Revision;
}

export function zeroRevision(): Revision {
  return ZERO_REVISION;
}

function mix64(value: bigint, prime: bigint): bigint {
  const step1 = value ^ (value >> 33n);
  const step2 = (step1 * prime) & MASK64;
  return step2 ^ (step2 >> 33n);
}

function hashEventId(eventId: EventId): bigint {
  const hex = (eventId as string).replaceAll('-', '');
  if (!HEX_32_REGEX.test(hex)) {
    return 1n;
  }
  const hi = BigInt(`0x${hex.slice(0, 16)}`);
  const lo = BigInt(`0x${hex.slice(16, 32)}`);

  const rawH1 = (hi ^ ((lo * PRIME1) & MASK64)) & MASK64;
  const h1 = mix64(rawH1, PRIME2);

  const rawH2 = (lo ^ ((hi * PRIME2) & MASK64)) & MASK64;
  const h2 = mix64(rawH2, PRIME1);

  const combined = ((h1 << 58n) ^ h2) & MASK_122;
  return combined | 1n;
}

function encodeRevision(state: bigint): Revision {
  if (state === 0n) {
    return ZERO_REVISION;
  }
  const s = state & MASK_122;
  const hi = s >> 74n;
  const mid = (s >> 62n) & 0xf_ffn;
  const variableBits = (s >> 60n) & 0x3n;
  const lo = s & ((1n << 60n) - 1n);

  const hiHex = hi.toString(16).padStart(12, '0');
  const midHex = mid.toString(16).padStart(3, '0');
  const variableNibble = (8n | variableBits).toString(16);
  const loHex = lo.toString(16).padStart(15, '0');

  return asRevision(
    `${hiHex.slice(0, 8)}-${hiHex.slice(8, 12)}-8${midHex}-${variableNibble}${loHex.slice(0, 3)}-${loHex.slice(3)}`,
  );
}

function decodeRevision(revision: Revision): bigint {
  const hex = (revision as string).replaceAll('-', '');
  if (hex === '00000000000000000000000000000000' || !HEX_32_REGEX.test(hex)) {
    return 0n;
  }
  const hi = BigInt(`0x${hex.slice(0, 12)}`);
  const mid = BigInt(`0x${hex.slice(13, 16)}`);
  const variableNibble = Number.parseInt(hex[16] ?? '0', 16);
  const variableBits = BigInt((Number.isNaN(variableNibble) ? 0 : variableNibble) & 0x3);
  const lo = BigInt(`0x${hex.slice(17, 32)}`);

  return (hi << 74n) | (mid << 62n) | (variableBits << 60n) | lo;
}

/**
Accumulates an EventId into a Revision token using a commutative set-hash accumulator.
Applying events in any order produces the identical Revision token.
Applying any event advances the Revision token.
*/
export function accumulateRevision(current: Revision, eventId: EventId): Revision {
  const currentBigInt = decodeRevision(current);
  const eventHash = hashEventId(eventId);
  const nextBigInt = (currentBigInt + eventHash) & MASK_122;
  return encodeRevision(nextBigInt);
}

/**
@deprecated Use accumulateRevision instead. Kept for backwards compatibility.
*/
export function maxRevision(current: Revision, eventId: EventId): Revision {
  return (eventId as string) > (current as string) ? asRevision(eventId) : current;
}
