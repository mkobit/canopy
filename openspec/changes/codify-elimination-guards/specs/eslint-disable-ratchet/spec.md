## ADDED Requirements

### Requirement: Unused disable directives are rejected

The lint configuration SHALL treat an `eslint-disable` directive that suppresses no reported problem as an error, so that a directive left behind after a functional rewrite fails the build.

#### Scenario: Directive suppresses nothing

- **WHEN** a source file contains an `eslint-disable-next-line <rule>` comment but the following line produces no violation of `<rule>`
- **THEN** `bun run lint` reports the directive as an error and exits non-zero

#### Scenario: Directive still suppresses a live violation

- **WHEN** a source file contains an `eslint-disable-next-line <rule>` comment and the following line would otherwise violate `<rule>`
- **THEN** `bun run lint` does not flag the directive as unused

### Requirement: Total disable directives may only decrease

The lint pipeline SHALL count anchored `eslint-disable` directives in linted source and fail when the count exceeds a committed baseline, so the number of escape hatches can only stay flat or shrink over time.

#### Scenario: New directive added above the baseline

- **WHEN** a change adds an `eslint-disable` directive that raises the total above the committed baseline
- **THEN** the count-ceiling check fails `bun run lint` and its message names the current count, the baseline, and how to resolve it

#### Scenario: Directive count at or below baseline

- **WHEN** the total anchored directive count is less than or equal to the committed baseline
- **THEN** the count-ceiling check passes

#### Scenario: Baseline is the single source of truth

- **WHEN** a rewrite removes directives and the author lowers the committed baseline to the new count
- **THEN** the check passes at the new, lower ceiling and any later regression above it fails

### Requirement: Directive counting is deterministic and scoped

The counter SHALL use one canonical, documented method — anchored directive comments in linted source files, excluding generated, vendored, and eslint-ignored paths — so the count is reproducible and not inflated by string mentions of the token in tooling or docs.

#### Scenario: String mention is not counted

- **WHEN** a tooling script or comment contains the literal text `eslint-disable` in prose or a string that is not a directive at the start of a comment
- **THEN** the counter does not count it

#### Scenario: Directive in an eslint-ignored file is not counted

- **WHEN** an `eslint-disable` directive appears in a path that `eslint.config.mjs` ignores (for example generated guest or transpiled output)
- **THEN** the counter does not count it, because eslint never evaluates it
