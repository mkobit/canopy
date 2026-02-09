# Workflow system

> Status: **draft — conceptual, not implementation-ready**
> Scope: workflow definitions, step execution, triggering, event integration
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md), [2026-02-08-event-system.md](2026-02-08-event-system.md), [2026-02-08-extension-and-execution-model.md](2026-02-08-extension-and-execution-model.md)

---

## 1. Principles

Workflows are multi-step processes defined as nodes in the graph.
Each step invokes an action (a system built-in or an extension).
Workflow execution produces events, keeping the full execution history in the event log.

Workflows are not a runtime concept separate from the graph.
They are graph data that the system interprets and executes.

---

## 2. Workflow definition

A **WorkflowDefinition** is a system node type.
It defines a sequence of steps, each referencing an action to invoke.

### Workflow node properties

| Property      | Type   | Required | Description                  |
| ------------- | ------ | -------- | ---------------------------- |
| `name`        | string | yes      | Human-readable workflow name |
| `description` | string | no       | What this workflow does      |

### Steps as edges

Workflow steps are represented as edges from the WorkflowDefinition node to action nodes.
Each step edge carries:

| Property    | Type   | Required | Description                              |
| ----------- | ------ | -------- | ---------------------------------------- |
| `position`  | string | yes      | Fractional index for step ordering       |
| `step_name` | string | no       | Human-readable step label                |
| `config`    | string | no       | Step-specific configuration (serialized) |

The target of a step edge is an action node — either a system-provided action or an extension node.

---

## 3. Triggering

Workflows can be triggered by:

- **Event triggers**: a specific event type occurs (e.g., NodeCreated with a certain type).
- **Manual triggers**: a user explicitly runs the workflow.
- **Scheduled triggers**: time-based execution (future, depends on scheduler infrastructure).
- **Condition triggers**: a graph query matches (e.g., "any node with property X > 10").

Trigger definitions are edges from trigger nodes to WorkflowDefinition nodes.
The system evaluates triggers as events arrive or conditions change.

> **Open question**: how trigger evaluation scales with many workflows and many events.
> Naive evaluation (check every trigger on every event) may not scale.

---

## 4. Execution

### Execution produces events

When a workflow runs, each step's execution produces events:

| Event                   | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `WorkflowStarted`       | A workflow execution began                                      |
| `WorkflowStepCompleted` | A step finished successfully                                    |
| `WorkflowStepFailed`    | A step failed                                                   |
| `WorkflowCompleted`     | All steps finished successfully                                 |
| `WorkflowFailed`        | The workflow failed (a step failed and no recovery was defined) |

These are **domain events**, distinct from the six core graph events defined in the [event system](2026-02-08-event-system.md).
They enter the normal event log alongside graph events.
Workflow execution history is queryable, replayable, and auditable.

> **Open question**: whether workflow events are part of the core `GraphEvent` union or a separate `WorkflowEvent` category.
> The event system doc defines the core six; workflow events extend that set.

### Step execution

Each step is an action invocation.
The action receives:

- Input data (from the trigger, from previous step outputs, or from configuration).
- Capability handles scoped to its permissions (see extension and execution model).

The action does its work and returns a result.
The result is available to subsequent steps.

### Error handling

If a step fails, the workflow can:

- **Stop**: mark the workflow as failed. This is the default.
- **Skip**: continue to the next step (if the step is marked optional).
- **Retry**: re-execute the step (with configurable retry limits).

Error handling configuration is a future concern.
The initial model is: step fails, workflow fails.

---

## 5. System-provided actions

The system ships with built-in actions that do not require extensions:

- **Create node**: create a new node with specified type and properties.
- **Create edge**: create an edge between two nodes.
- **Update properties**: modify properties on a node or edge.
- **Run query**: execute a query and pass results to the next step.
- **Send notification**: surface a message to the user (future).

These cover basic graph manipulation workflows without requiring WASM extensions.

---

## 6. Use cases

Workflows enable automation within the vault:

- **Processing inbox**: new nodes without edges are "unprocessed"; a workflow prompts the user to categorize them or automatically applies rules.
- **External import**: a workflow fetches data from an external source, creates nodes, and links them.
- **Data transformation**: a workflow reads nodes of one type and creates derived nodes of another type.
- **Scheduled review**: a workflow surfaces nodes that haven't been modified in N days.
- **AI-assisted tagging**: a workflow sends node content to an AI agent and applies returned tags as edges.

These are illustrative, not exhaustive.

---

## 7. What this document does not cover

| Concern                                          | Where it belongs                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| WASM action implementation                       | [Extension and execution model](2026-02-08-extension-and-execution-model.md) |
| Workflow UI (builder, execution monitoring)      | UI/interaction design                                                        |
| Scheduler infrastructure for time-based triggers | Infrastructure design                                                        |
| AI agent workflow integration                    | [Query engine](2026-02-08-query-engine.md) (external access)                 |

---

## 8. Open questions

1. Whether workflow execution state (current step, intermediate results) is stored in the graph or held in memory.
2. Long-running workflow semantics: can a workflow span hours or days (e.g., waiting for user input at a step)?
3. Concurrent workflow execution: can multiple instances of the same workflow run simultaneously?
4. Trigger evaluation performance at scale.
5. Whether workflows can invoke other workflows (sub-workflows) and how recursion is prevented.
6. Step output format and how data flows between steps.
7. Whether workflow definitions are versioned (what happens to running workflows when the definition changes).
8. Compensation/rollback semantics: if a workflow fails partway through, should completed steps be undone?
