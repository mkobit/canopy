## 1. Workflow creation and scripting

- [ ] 1.1 Create `.github/workflows/beads-validation.yml` with push, schedule, and workflow_dispatch triggers
- [ ] 1.2 Implement step to execute `bd doctor --check=conventions` and `bd preflight`
- [ ] 1.3 Implement step to search open issues and create a single `[Beads Audit Failure]` issue on failure

## 2. Validation and testing

- [ ] 2.1 Test workflow execution locally and verify `bd doctor` error detection
- [ ] 2.2 Verify duplicate issue suppression logic
