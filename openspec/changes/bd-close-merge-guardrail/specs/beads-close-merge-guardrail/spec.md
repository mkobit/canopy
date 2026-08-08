## ADDED Requirements

### Requirement: Detect closed code-bearing issues unreachable from origin/main

The system SHALL identify bd issues that are closed, whose type is code-bearing (`task`, `bug`, `feature`, `chore` by default, excluding `epic`, `decision`, `story`, `milestone`, `spike`), and for which no commit reachable from `origin/main` contains the issue's ID, as a boundary-anchored match, in its message (subject or body).

#### Scenario: Closed issue with no reachable commit is flagged

- **WHEN** the check runs and finds a closed `task`-type issue whose ID does not appear in any commit message reachable from `origin/main`
- **THEN** the issue is reported as drifted

#### Scenario: Closed issue with a reachable commit is not flagged

- **WHEN** the check runs and finds a closed issue whose ID appears in at least one commit message reachable from `origin/main`
- **THEN** the issue is not reported as drifted

#### Scenario: Non-code-bearing issue types are excluded

- **WHEN** the check evaluates a closed issue of type `epic`, `decision`, `story`, `milestone`, or `spike`
- **THEN** the issue is skipped regardless of commit reachability

#### Scenario: ID matching does not false-negative on a related but distinct ID

- **WHEN** a closed issue's ID is a prefix of another issue's ID that does appear in a reachable commit message (e.g. issue `canopy-qvn` is closed and only a commit mentioning `canopy-qvn.5` is reachable)
- **THEN** `canopy-qvn` is still reported as drifted, since `canopy-qvn.5` is not a match for `canopy-qvn`

#### Scenario: Labeled exemptions are excluded regardless of type

- **WHEN** the check evaluates a closed, code-bearing-type issue that carries a `no-code` label
- **THEN** the issue is skipped regardless of commit reachability

#### Scenario: Opted-in spike is checked like a code-bearing type

- **WHEN** the check evaluates a closed `spike`-type issue that carries a `code-bearing` label
- **THEN** the issue is checked for commit reachability like any default code-bearing type

### Requirement: Grace period before flagging

The system SHALL NOT report a closed issue as drifted until a configurable grace period (default 48 hours) has elapsed since it was closed, to avoid false positives for the normal close-then-open-PR workflow.

#### Scenario: Recently closed issue is not yet flagged

- **WHEN** an issue was closed less than the grace period ago and has no reachable commit yet
- **THEN** the check does not report it as drifted on this run

#### Scenario: Issue past the grace period is flagged

- **WHEN** an issue was closed more than the grace period ago and still has no reachable commit
- **THEN** the check reports it as drifted

### Requirement: Automated CI reporting

The system SHALL run the drift check in CI on a recurring schedule and, when drifted issues are found, ensure a single tracking GitHub issue exists summarizing them, reusing the reporting pattern established for other beads convention checks rather than duplicating scheduling/reporting infrastructure.

#### Scenario: CI finds drift and no open report exists

- **WHEN** a scheduled CI run finds one or more drifted issues and no open `[Beads Audit Failure]`-style tracking issue exists
- **THEN** CI creates one listing the drifted issue IDs

#### Scenario: CI finds drift and a report already exists

- **WHEN** a scheduled CI run finds drifted issues and an open tracking issue already exists
- **THEN** CI updates that issue's body with the current drifted-ID list (removing IDs that are no longer drifted) instead of creating a duplicate

#### Scenario: CI finds no drift

- **WHEN** a scheduled CI run finds zero drifted issues
- **THEN** no issue is created and any prior open tracking issue is left for manual close

### Requirement: Local advisory check

The system SHALL provide a locally runnable command that reports the same drift signal for a given issue ID (or the current HEAD's referenced issues), so a developer or agent can check before or after running `bd close` without requiring `bd` itself to support a blocking pre-close hook.

#### Scenario: Local check on an issue with no reachable commit

- **WHEN** a developer runs the local check against an issue ID that has no commit reachable from `origin/main`
- **THEN** the command exits non-zero and prints a warning naming the issue

#### Scenario: Local check on an issue with a reachable commit

- **WHEN** a developer runs the local check against an issue ID that has a commit reachable from `origin/main`
- **THEN** the command exits zero
