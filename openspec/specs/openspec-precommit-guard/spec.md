# openspec-precommit-guard Specification

## Purpose
TBD - created by archiving change openspec-precommit-guard. Update Purpose after archive.
## Requirements
### Requirement: Staged OpenSpec changes are strict-validated before commit

The pre-commit hook SHALL run `bun run check:openspec-changes`, which scans the staged diff (`git diff --cached --name-only --diff-filter=ACMR`), extracts each distinct `openspec/changes/<name>/` directory touched (excluding `archive/`), runs `bunx openspec validate <name> --strict` per change, and fails the commit when any change is invalid — so a broken OpenSpec change cannot be committed from any contributor's machine, agent or human.

#### Scenario: A commit stages an invalid OpenSpec change

- **WHEN** a commit stages one or more files under `openspec/changes/<name>/` and that change fails `bunx openspec validate <name> --strict`
- **THEN** the commit is rejected and the hook prints the failing change name and the validator output

#### Scenario: A commit stages a valid OpenSpec change

- **WHEN** a commit stages files under one or more `openspec/changes/<name>/` directories and every touched change passes strict validation
- **THEN** the hook passes and the commit proceeds

#### Scenario: A commit touches no OpenSpec change

- **WHEN** a commit stages no files under any `openspec/changes/<name>/` directory
- **THEN** the OpenSpec check is a no-op and does not affect the commit

#### Scenario: A commit touches only an archived change

- **WHEN** a commit stages files only under `openspec/changes/archive/`
- **THEN** no change name is extracted and the OpenSpec check is a no-op, because archived changes are excluded from validation

#### Scenario: A contributor deliberately snapshots a work-in-progress change

- **WHEN** a contributor needs to commit an intentionally incomplete OpenSpec change that does not yet pass strict validation
- **THEN** they may bypass the hook with `git commit --no-verify`, and the pushed change is still caught by the `openspec.yml` CI validation, so the guard is a fast local signal rather than the sole gate

### Requirement: The pre-commit OpenSpec check runs alongside the existing version check

The pre-commit hook SHALL invoke `bun run check:openspec-changes` in addition to the existing `bun run check:versions`, without altering the version check, so both guards run on every commit.

#### Scenario: Both pre-commit guards run

- **WHEN** a contributor makes a commit
- **THEN** `bun run check:versions` and `bun run check:openspec-changes` both run, and the commit is rejected if either fails

