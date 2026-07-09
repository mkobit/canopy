## MODIFIED Requirements

### Requirement: Lint exits clean after violation remediation

After tightening or upgrading the ESLint configuration, all pre-existing and newly-surfaced violations in `packages/` and `apps/web/` SHALL be fixed so that `bun run lint` exits with code 0 and reports 0 errors.

#### Scenario: CI lint check passes

- **WHEN** the CI lint step runs `bun run lint`
- **THEN** the command SHALL exit 0 with no errors

#### Scenario: TypeScript type check still passes

- **WHEN** `bun run typecheck` is run after ESLint config changes and violation fixes
- **THEN** the command SHALL exit 0
