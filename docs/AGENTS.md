# docs/

Long-form project documentation.
Per-package guidance lives in each package's `AGENTS.md`.

## Subdirectories

- `design/` — design proposals and decisions.
  Files are date-prefixed (`YYYY-MM-DD-slug.md`).
  The canonical reference is `2026-02-06-core-data-model.md`.
- `architecture/` — current-state architecture maps.
  `bounded-contexts.md` is the canonical package layout; `graph-model.md` summarizes the kernel; `decisions.md` is a running, append-only log of implementation-time decisions too small for their own dated `design/` doc.
- `research/` — dated investigations and external evaluations.
  Frozen snapshots; do not retrofit unless an example is misleading.
- `extensions/` — extension and plugin design notes.

## Style

Sentence case for titles.
One sentence per line in Markdown.
Avoid trailing punctuation in bullet lists.

## Forbidden

- Do not store generated artifacts here.
- Do not add tutorials or onboarding guides; agent context lives in `AGENTS.md` files.
- Do not duplicate code into docs; link to source files instead.
