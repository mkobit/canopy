# Agent guidelines

## Tooling and scripts

All developer scripts and Git hooks must be authored in TypeScript.
This maintains consistency with the project's primary toolchain.
This also avoids introducing external runtimes and package managers like Python and uv.
Any new scripts or hooks must run via Bun and TypeScript, and are verified by the lint and typecheck gates.
