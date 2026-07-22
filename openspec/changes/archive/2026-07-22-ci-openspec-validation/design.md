## Context

We currently run OpenSpec validation manually on developer workstations.
The GitHub Actions workflow ignores the `openspec/**` directory.
It also does not run the validation command, allowing invalid specification changes to bypass validation.

## Goals / Non-Goals

**Goals:**

- Automatically validate all OpenSpec changes and specifications on every push and pull request.
- Run OpenSpec validation during local developer linting.
- Trigger CI workflows when specifications are changed.
- Remove absolute workstation path references from active specs and change proposals.

**Non-Goals:**

- Migrating OpenSpec to a different tool or validator.
- Restructuring the existing folder layout of `openspec/`.

## Decisions

### Decision 1: Integrate OpenSpec validation into the root lint command
We will update the `"lint"` script in the root `package.json` to include `bun openspec validate --all --no-interactive`.

- **Rationale**: Since `bun run lint` is already executed in the CI pipeline and by developers locally, integrating the check there guarantees enforcement with minimal configuration changes. Running via local `bun` resolution instead of `bunx` avoids network lookup latency and ensures offline reliability.
- **Alternatives considered**: Defining a separate `"validate:specs"` script and adding a new job or step to CI. This would require editing multiple places and might be missed during local development. Using `bunx` which causes network lookup checks.

### Decision 2: Remove openspec paths from CI paths-ignore filters
We will modify `.github/workflows/ci.yml` to remove `- 'openspec/**'` from the `paths-ignore` lists on both `push` and `pull_request` triggers.

- **Rationale**: This ensures that any pull requests modifying specifications trigger the CI pipeline, running the validation steps to verify correctness.
- **Alternatives considered**: Leaving paths ignored. This would allow spec-only pull requests to merge without verification.

### Decision 3: Use relative path references in specification files
We will replace hardcoded workstation absolute file URLs with relative links in active specifications and active changes.

- **Rationale**: Workstation-specific paths (like `file:///home/mkobit/...`) are non-portable, break for other developers, and will fail if the validation CLI checks resource existence in future versions.
- **Alternatives considered**: Hardcoding host-agnostic absolute system paths (inflexible across different environments).

## Adversarial review and mitigations

### Resource and performance overhead
- **Risk**: Running validation on every change could slow down the CI workflow or local lint commands.
- **Mitigation**: `openspec validate` is a fast static-analysis tool that runs in less than one second, resulting in no noticeable overhead. Local execution via `bun` prevents network delay.

### Failure modes and edge cases
- **Risk**: If the validation command fails or times out, it could block legitimate code pull requests from merging.
- **Mitigation**: Spec validation failures are correct indicators of invalid requirements or incomplete tasks. This is the desired quality gate behavior.

### Security and isolation
- **Risk**: Running CLI validation could run arbitrary code or require network connections in CI.
- **Mitigation**: `openspec validate` runs purely locally, reads static markdown files, and executes no external code or network requests.

### Migration/backward compatibility
- **Risk**: Activating the gate on `main` could fail immediately if existing specifications do not conform to the schema.
- **Mitigation**: We have run `bun openspec validate --all --no-interactive` locally and confirmed that all 18 specifications pass validation cleanly.
