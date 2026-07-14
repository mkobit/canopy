# Domain namespace split

## Context

Bead `canopy-6cz`.
This document outlines the design for splitting the flat `content` namespace into separate, domain-specific namespaces.
This change establishes clear boundaries for future plugin modules.
It builds upon the type-authoring control plane proven in `canopy-goi` and `canopy-ayv`.

## Goals

*   Decompose the single `content` namespace into isolated `tasks` and `contacts` namespaces.
*   Establish domain boundaries that mirror independent plugin installations.
*   Support cross-namespace relations where types in one namespace reference types in another.
*   Validate the schema definitions via updated end-to-end tests.
*   Align types with schema.org definitions where appropriate for canonical compatibility.

## Target schema design

### Namespaces

We define three user namespaces in the schema.

*   `tasks` (kind: `user`):
    Represents the task and project management domain.
*   `contacts` (kind: `user`):
    Represents the contacts and identity domain.
*   `cadence` (kind: `user`):
    Represents the execution and scheduling domain.

### NodeTypes

Node types are scoped to their respective namespaces to prevent name collisions and enable modular installation.

*   **contacts:Person:**
    Aligned with schema.org/Person.
    Properties: `name` (required text), `email` (optional text).
*   **tasks:Project:**
    Aligned with schema.org/Project.
    Properties: `name` (required text), `description` (optional text), `status` (optional text).
*   **tasks:Task:**
    Aligned with schema.org/Action (or schema.org/ControlAction).
    Properties: `title` (required text), `priority` (optional number), `dueDate` (optional plain-date), `description` (optional text), `status` (optional text).
*   **cadence:Cadence:**
    Properties: `name` (required text), `rrule` (required text), `phases` (required text).
*   **cadence:CadenceAction:**
    Properties: `actionKind` (required text), `target` (optional reference), `description` (optional text).

### EdgeTypes

Edge types describe relationships between nodes.
To maintain complete isolation between plugin domains, schema definitions for edge types do not encode hard dependencies on other namespaces.
Instead, cross-namespace relationships are advisory, using loose type matching or future projected/pseudo-injected edges (ghost nodes) that are resolved dynamically.

*   **tasks:belongs_to:**
    Connects `tasks:Task` (source) to `tasks:Project` (target).
*   **tasks:assigned_to:**
    Connects `tasks:Task` (source) to a target node.
    It does not enforce a hard compile-time constraint on `contacts:Person`.
    It acts as a loose reference that can be resolved dynamically via views or projection queries.
*   **cadence:triggers:**
    Connects `cadence:Cadence` (source) to `cadence:CadenceAction` (target).

## Verification plan

We will verify this design by refactoring the existing E2E tests in the UI.

1.  Update `apps/web/e2e/domain-content-types.e2e.ts`.
2.  Change the test to create both the `tasks` and `contacts` namespaces.
3.  Create the `contacts:Person`, `tasks:Project`, and `tasks:Task` NodeTypes.
4.  Define the cross-namespace EdgeTypes `tasks:belongs_to` and `tasks:assigned_to`.
5.  Instantiate a `tasks:Task` node using the UI form.
6.  Assert that properties and validation inputs render correctly.

## Future considerations

Cross-namespace mapping and dynamic transformations will be designed under `canopy-7dp`.
Projected and ephemeral nodes for generated content will be researched under `canopy-4mo`.
