## 1. Label taxonomy documentation

- [ ] 1.1 Create `.beads/labels.md` documenting the full taxonomy: `complexity:low/medium/high`, `mechanical`, `needs-design`, `agent:jules`, `change:<name>`
- [ ] 1.2 Register labels in Beads with `bd label` so they are available for use

## 2. mol-openspec-change formula

- [ ] 2.1 Create `.beads/formulas/` directory
- [ ] 2.2 Write `.beads/formulas/mol-openspec-change.formula.yaml` with `change_name` variable, epic root, and task group step structure
- [ ] 2.3 Add label inference rules to the formula (mechanical keyword heuristics → `complexity:low` + `mechanical` + `agent:jules` + P3 priority)
- [ ] 2.4 Verify `bd formula list` shows the formula
- [ ] 2.5 Run `bd mol pour mol-openspec-change --var change_name=functional-guardrails --dry-run` and confirm output matches tasks.md structure

## 3. Jules Beads-discovery prompt

- [ ] 3.1 Create `.jules/prompts/beads-claim-and-implement.md` with two-phase structure: `bd ready --filter agent:jules` discovery → claim one → implement → open PR
- [ ] 3.2 Verify the prompt references the one-task-per-session constraint and PR body convention (issue ID reference)

## 4. Seed functional-guardrails as first real usage

- [ ] 4.1 Run `bd mol pour mol-openspec-change --var change_name=functional-guardrails` to seed the first real change
- [ ] 4.2 Verify seeded issues have correct labels and priorities
- [ ] 4.3 Manually adjust any label inference misclassifications with `bd label` and `bd priority`

## 5. Documentation

- [ ] 5.1 Update `.jules/AGENTS.md` with the three-layer model summary and agent routing rules
- [ ] 5.2 Add a `## Seeding a change` section to the project CLAUDE.md or a new `docs/agentic-protocol.md` explaining the handoff step
