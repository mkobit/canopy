## ADDED Requirements

### Requirement: Preserve synchronous sliding-window acquisition

The rewrite SHALL retain the public synchronous limiter signature and default Temporal time source, with isolated state per limiter.
It SHALL remove only the expired leading timestamps strictly less than `now - windowMs` and record successful acquisitions only.

#### Scenario: Window equality and rejected attempts

- **GIVEN** a limiter with maxRequests 1 and windowMs 1000
- **WHEN** acquisition occurs at 0, 500, 1000, 1001, and 2001
- **THEN** results SHALL be true, false, false, true, and false respectively
- **AND** acquisition at 2002 SHALL return true
- **AND** rejected attempts SHALL NOT extend the window

#### Scenario: Isolated state and supplied times

- **WHEN** one limiter reaches capacity
- **THEN** a second limiter SHALL retain its own capacity
- **AND** supplied non-monotonic times SHALL preserve the current leading-prefix expiry behavior rather than filter timestamps behind an unexpired head

### Requirement: Preserve atomic frame decoding

The rewrite SHALL retain framing signatures, 4-byte little-endian lengths, the 1,048,576-byte cap, ordered complete messages, and exact incomplete remainder without input mutation.
A malformed or oversize frame SHALL return the current typed error with no partial messages from that call.

#### Scenario: Fragmented prefix and body

- **WHEN** a frame is split at each position in its prefix and body
- **THEN** incomplete calls SHALL retain the exact unconsumed bytes
- **AND** appending the remaining bytes SHALL decode the original payload once without changing any input bytes

#### Scenario: Combined messages and incomplete tail

- **WHEN** two complete frames and an incomplete third frame are supplied together
- **THEN** messages SHALL be returned in input order with the exact third-frame bytes as remainder

#### Scenario: Malformed or oversize rejection without partial results

- **WHEN** a valid frame precedes malformed JSON or a prefix declaring MAX_FRAME_BYTES plus 1 in the same call
- **THEN** the call SHALL return the corresponding current error and no messages
- **AND** oversize rejection SHALL occur without waiting for the body
- **AND** encoding an oversize payload SHALL remain rejected
- **AND** a payload at the cap SHALL NOT be rejected solely for its size

#### Scenario: Many small frames

- **WHEN** increasing batches of many minimal valid frames are decoded
- **THEN** all messages SHALL retain order without stack overflow
- **AND** decoding SHALL avoid recursive frame traversal and repeated copies of the full accumulated message array
- **AND** focused evidence SHALL record time and allocation growth without an arbitrary performance threshold

### Requirement: Preserve successful state reuse and independent dispatch

The host SHALL reuse successful connection and WebClip type results, keep failures retryable, and preserve current concurrent request behavior.
It SHALL NOT introduce in-flight deduplication, request serialization, or failure caching.

#### Scenario: Successful reuse and failure retry

- **WHEN** sequential requests follow a successful connection and required type lookup
- **THEN** the successful state SHALL be reused without another lookup
- **WHEN** a connection or type lookup fails and the next attempt succeeds
- **THEN** the first response SHALL retain the typed unavailable error and the next request SHALL retry and succeed
- **AND** connection defects currently captured by Effect.exit SHALL retain the same unavailable mapping

#### Scenario: Concurrent cold requests and independent replies

- **WHEN** two requests reach a cold lookup before either lookup completes
- **THEN** both SHALL be allowed to start their lookup as in the current host
- **WHEN** multiple decoded frames start replies and the later request completes first
- **THEN** its response SHALL be emitted without waiting for the earlier reply

### Requirement: Preserve narrowing and error relay

The host SHALL preserve current allowlist, rate, connection, namespace, schema validation, dispatch, and wire conversion behavior in that order.
It SHALL add no listener, permission, method, dependency, runtime schema, kernel type, or independent graph write path.

#### Scenario: Denied methods and rate checks

- **WHEN** a method is outside the allowlist
- **THEN** rejection SHALL precede rate acquisition and connection
- **WHEN** an allowed request exceeds the rate limit
- **THEN** it SHALL NOT connect or dispatch

#### Scenario: Namespace denial and retry identity

- **WHEN** createNode or draft.apply specifies a type outside the ensured WebClip type
- **THEN** the host SHALL reject it before dispatch and return the resolved webClipTypeId for retry
- **AND** allowed draft create, preview, commit, and discard behavior SHALL remain unchanged

#### Scenario: Serialization and daemon errors

- **WHEN** validated draft events contain Map properties
- **THEN** toWireEvent conversion SHALL retain their properties on the JSON wire
- **WHEN** the daemon returns an error with data
- **THEN** the host SHALL preserve the error code, message, and data in the response

### Requirement: Preserve the real stdio boundary

The host SHALL emit native-messaging frames only on stdout and clear buffered stdin bytes on a framing failure.
Future acceptance SHALL include a real child process in addition to the existing createClipHost real-daemon test.

#### Scenario: Child-process fragmentation and combined frames

- **GIVEN** a test-only launcher registers runClipHost first and a separate stdin data observer second, then reports readiness
- **WHEN** the observer reports consumed chunk byte counts over dedicated test-only IPC after the synchronous host listener returns
- **AND** the parent sends each next prefix or body fragment only after acknowledgements cover the previous fragment
- **THEN** stdout SHALL contain only complete decodable reply frames with the expected ids and results
- **AND** combined valid messages SHALL decode correctly without assuming writer calls define decoder calls

#### Scenario: Child-process frame rejection recovery

- **WHEN** malformed JSON input or an oversize prefix is sent alone to the child process
- **AND** the parent waits for test-only consumption acknowledgements covering all those bytes before sending a fresh valid frame
- **THEN** the process SHALL return the fresh frame's expected reply without stale bytes
- **AND** no product hook, stdout diagnostic, protocol message, or production acknowledgement SHALL be added
- **AND** valid-then-invalid all-or-nothing assertions SHALL remain in direct decodeFrames tests

### Requirement: Remove all directives with one internal return change

The rewrite SHALL remove all 16 current directives without a new ignore, exception, or rule setting.
App-internal runClipHost SHALL return the existing stdin.on registration result with its inferred third-party type.
All other limiter, framing, and host public signatures SHALL remain unchanged.

#### Scenario: Internal registration return

- **WHEN** the current index.ts caller invokes runClipHost and ignores its result
- **THEN** listener registration, runtime behavior, and native-messaging wire behavior SHALL remain unchanged
- **AND** the narrow internal TypeScript return change SHALL be explicit in design review

#### Scenario: Structural validation succeeds before approval

- **WHEN** strict OpenSpec validation succeeds
- **THEN** tasks.md, implementation packet staging, implementation Beads, and implementation SHALL remain withheld until independent adversarial review and merged design approval
