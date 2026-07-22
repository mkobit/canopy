## Why

We currently do not run OpenSpec validation in the CI pipeline or local lint scripts.
This allows invalid specifications or incomplete changes to bypass quality gates and get merged.

## What Changes

- **Integrate OpenSpec validation in local lint**: Add `openspec validate --all --no-interactive` to the root `bun run lint` script.
- **Run validation in CI**: Include the updated lint step in GitHub Actions workflows to validate specifications on push and pull requests.
- **Update path filters in CI**: Ensure that changes under `openspec/**` trigger the CI pipeline.

## Capabilities

### New Capabilities

- `ci-specification-validation`: runs non-interactive OpenSpec validation in local quality gates and CI pipelines.

### Modified Capabilities

(none)

## Impact

- Root `package.json`: adds `openspec validate` check to the `lint` script.
- `.github/workflows/ci.yml`: removes `openspec/**` from the push and pull request `paths-ignore` filters.
