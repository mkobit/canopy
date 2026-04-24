# Triggered workflows: simple event triggers

> Status: **draft**
> Scope: event triggers, node creation triggers, basic action execution

---

## 1. Concept

Workflows can be automatically started when certain events occur in the system.
The first implementation focuses on **Node Creation Triggers**.

When a node of a specific type is created, a corresponding workflow is executed.

---

## 2. Data model

### Trigger node

A `WorkflowTrigger` is a system node that links an event condition to a `WorkflowDefinition`.

| Property      | Type      | Required | Description                                     |
| ------------- | --------- | -------- | ----------------------------------------------- |
| `name`        | string    | yes      | Human-readable trigger name                     |
| `eventType`   | string    | yes      | The event type to trigger on (e.g. NodeCreated) |
| `condition`   | string    | no       | JSON-encoded condition (e.g. typeId filter)     |
| `workflowRef` | reference | yes      | Reference to the WorkflowDefinition node        |

### System registration

Trigger nodes are created during bootstrap or by users.
The system maintains an active index of triggers to efficiently match incoming events.

---

## 3. Initial implementation: NodeCreated trigger

The simplest trigger matches a `NodeCreated` event for a specific `TypeId`.

Example `condition` for a NodeCreated trigger:

```json
{ "typeId": "8f3e..." }
```

When the `EventBus` emits a `NodeCreated` event where `node.type === typeId`, the system starts the workflow referenced by `workflowRef`.

---

## 4. Execution flow

1. `EventBus` emits events.
2. `WorkflowEngine` (new component) observes events.
3. For each event, `WorkflowEngine` finds matching `WorkflowTrigger` nodes.
4. For each matching trigger, a `WorkflowExecution` is created.
5. The execution runs the steps defined in the `WorkflowDefinition`.
6. Execution history is stored in the event log (WorkflowStarted, WorkflowCompleted, etc.).

---

## 5. Next steps

- Implement `WorkflowTrigger` system type in bootstrap.
- Implement `WorkflowEngine` observer.
- Implement basic "Create Edge" action as a first workflow step.
