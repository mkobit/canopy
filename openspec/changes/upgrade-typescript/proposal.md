## Why

Upgrading to TypeScript 7 brings the Go-based compiler rewrite with 8x to 12x faster build performance.
It ensures long-term toolchain support and keeps code generation and type check gates performant.

## What Changes

- **Upgrade TypeScript dependency**: bump `typescript` from version 6.0.3 to 7.0.0 in the root `package.json`.
- **Ecosystem toolchain updates**: verify and update compatible `typescript-eslint` packages as needed to prevent parse failures.
- **Strict typing compliance**: resolve any new compiler type check errors introduced by TypeScript 7.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `eslint-functional-enforcement`: update lint and typecheck verification requirements to support TypeScript 7.

## Impact

- `package.json`: updates `typescript` version to `^7.0.0` or later.
- all workspace packages: compiled and type checked with the updated TypeScript compiler.
