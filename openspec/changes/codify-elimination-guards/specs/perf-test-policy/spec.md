## ADDED Requirements

### Requirement: Perf-based modules must carry perf tests

Project convention SHALL require that any module designated perf-based carries at least one performance or load test, and that a change touching such a module does not land without that test present and green.

#### Scenario: Change touches a perf-based module lacking a benchmark

- **WHEN** a contributor modifies a module listed as perf-based in the inventory and no perf/load test covers it
- **THEN** the convention requires adding a perf/load test as part of that change before it lands

#### Scenario: Convention is discoverable

- **WHEN** a contributor or agent reads `AGENTS.md`
- **THEN** the perf-test policy and the current list of perf-based modules are documented there

### Requirement: Perf-based module inventory is maintained

The project SHALL maintain an inventory of modules currently deemed perf-based and each one's benchmark status, and SHALL track gaps as beads so they are not lost.

#### Scenario: Inventory records benchmark status

- **WHEN** the inventory is consulted
- **THEN** each perf-based module shows whether a perf/load test exists and, if not, references the bead tracking the gap

#### Scenario: Newly identified perf-based module

- **WHEN** a module is newly designated perf-based
- **THEN** it is added to the inventory and, if it lacks a benchmark, a bead is filed for the gap
