import type { EventId } from './identifiers';
import type { Revision } from './identifiers';

// Sorts below any real EventId: uuidv7's leading hex reflects a large
// unix-ms timestamp, always greater than an all-zero prefix.
const ZERO_REVISION = '00000000-0000-0000-0000-000000000000' as Revision;

// Trusted cast for already-known-good values, mirroring the other `as*` casters in factories.ts.
export function asRevision(value: string): Revision {
  return value as Revision;
}

export function zeroRevision(): Revision {
  return ZERO_REVISION;
}

// Returns whichever of the two is lexicographically greater. EventId (uuidv7)
// and Revision are both fixed-format, same-length hex strings, so plain
// string comparison is consistent with numeric/byte-order comparison; the
// (string) casts are only to satisfy the distinct brands, not a type escape.
export function maxRevision(current: Revision, eventId: EventId): Revision {
  return (eventId as string) > (current as string) ? asRevision(eventId) : current;
}
