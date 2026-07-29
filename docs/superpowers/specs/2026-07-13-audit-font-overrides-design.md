# Audit codebase for hardcoded font overrides

This design specification addresses the font family naming convention discrepancy and hardcoded overrides.

## Context

The theme configuration in `index.css` defined a custom body font family under the `--font-body` variable.
However, standard components and inputs default to Tailwind's default `font-sans` family.
This mismatch caused some elements to bypass the custom Inter font family.

## Proposed changes

### Theme configuration

We will rename `--font-body` to `--font-sans` in `apps/web/src/index.css`.
This configuration automatically maps Tailwind's `font-sans` utility to the self-hosted Inter font.

### Component changes

We will update `apps/web/src/components/layout.tsx` to use the `font-sans` class instead of `font-body`.

## Verification plan

### Automated verification

We will run the following checks to ensure no regressions:
- Run `bun run build` to verify the production bundle builds successfully.
- Run `bun run lint` to verify formatting and lint rules.
- Run `bun run typecheck` to verify TypeScript compile checks.
- Run `bun test` to verify all unit and integration tests pass.
