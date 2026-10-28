## 1. Establish approved behavior

- [x] 1.1 Read the merged design and delivery packet; create the private repository and detached worktree at ea18a5666301ddb0ffdac32138e80fcb26237953 with independent frozen Bun 1.4.3 dependencies.
- [x] 1.2 Build and run existing scoped tests; inventory the 16 directives.
- [x] 1.3 Add and run characterization tests for limiter edge cases, atomic decoding and frame volume, successful state reuse and retries, concurrent cold requests, and real child-process stdio with consumption acknowledgements and a Unix-socket peer.

## 2. Apply the approved functional rewrite

- [x] 2.1 Replace limiter mutation with synchronous Ref.modify over readonly timestamps, preserving prefix-only expiry and NaN behavior.
- [x] 2.2 Decode with iterative Effect Array.unfold and typed JSON parse capture, preserving atomic errors and remainder bytes.
- [x] 2.3 Use success-only per-host connection and type Refs and split request helpers while preserving gates and cold concurrency.
- [x] 2.4 Use a per-process byte Ref and independent reply mapping; return the stdin registration result.

## 3. Validate and return

- [x] 3.1 Remove all 16 directives, run scoped lint/typecheck/tests, and lower the disable baseline.
- [x] 3.2 Run the final full quality gate and sandbox environment check; retain scenario and frame-volume evidence.
- [x] 3.3 Recheck scope and pinned contracts, return the binary patch, hash, worktree identity, exact check outcomes, and any unresolved concerns to root for independent review and integration.
