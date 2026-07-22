## Context

The canopy workspace uses Bun as its primary package manager and runtime.
Using npm or node directly bypasses the lockfile, which can lead to package inconsistency and CI gate failures.
We need an automated mechanism to prevent the introduction of npm or node commands in developer scripts and git hooks.

## Goals / Non-Goals

**Goals:**

- Block developers from running `npm install` within the project.
- Block the inclusion of commands starting with `npm`, `npx`, or `node` in any `package.json` scripts or Husky hooks.
- Output clear warnings directing developers to use `bun` or `bunx`.
- Ensure all quality gates continue to pass cleanly.

**Non-Goals:**

- Blocking the execution of node/npm commands outside of the repository workspace.
- Preventing the use of node-like APIs or package dependencies containing "node" in their name.

## Decisions

### Decision 1: Create a static script scanner tools/check-commands.ts

We will write a script to statically verify all scripts in `package.json` files and Husky hooks.

- **rationale**: Statically validating scripts at lint-time prevents bad configurations from being committed to version control.
- **alternatives considered**: Manual code review, which is error-prone and doesn't run automatically in CI.

### Decision 2: Implement a runtime blocker via preinstall hook

We will define a `"preinstall"` script in the root `package.json` that executes a minimal inline node snippet to log a warning and exit with error code 1.

- **rationale**: Since `bunfig.toml` specifies `ignoreScripts = true`, `bun install` will bypass the `preinstall` script, whereas `npm install` will run it and fail.
- **alternatives considered**: Using the `only-allow` npm package, which requires a new dependency and introduces network or bootstrap overhead.

### Decision 3: Update existing pre-commit hooks

We will replace `npx lint-staged` with `bunx lint-staged` in [.husky/pre-commit](file:///home/mkobit/workspace/mkobit/canopy/.husky/pre-commit).

- **rationale**: Keeps git hooks fully aligned with the Bun-only constraint and prevents self-blocking during pre-commit checks.
- **alternatives considered**: None, as we must resolve the existing `npx` reference to pass the static check.

## Risks / Trade-offs

- [Risk] Developers might still run `node <script>` directly in their terminals.
  - [Mitigation] While we cannot prevent direct shell command execution, blocking them in all committed scripts and hooks establishes a strong safety boundary for CI and development workflows.

## Adversarial review and mitigations

### Resource and Performance Overhead

- _Risk_: Running a script scanner during every lint phase adds overhead.
- _Mitigation_: The scanner will be executed via Bun and process a small set of files, completing in under 20ms.

### Failure Modes and Edge Cases

- _Risk_: A script might contain a multi-command chain where `npm` or `node` is not the first word of the script but is the first word of a sub-command (e.g. `tsc -b && node tools/verify-versions.ts`).
- _Mitigation_: The scanner will split script strings on shell delimiters like `&&`, `||`, `;`, and `|` to inspect every individual sub-command.
- _Risk_: The scanner might run against `node_modules` or build directories, causing false positives or infinite loops.
- _Mitigation_: The scanner will only inspect workspace directories specified in `package.json` and the `.husky` directory, ignoring `node_modules`.

### Security and Isolation

- _Risk_: Executing scripts inside package hooks can be a vector for malicious code execution.
- _Mitigation_: The inline `preinstall` script uses only native node APIs, is fully visible, and executes zero external code.

### Migration and Compatibility

- _Risk_: Existing scripts or IDE integrations might rely on `npm` or `node` commands.
- _Mitigation_: We will verify all package scripts and update the pre-commit hook. External tools configured to run npm will fail with a clear "use bun" message, prompting the developer to update their environment.
