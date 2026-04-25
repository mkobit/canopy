# Canopy Prototype Roadmap

**Status:** Draft
**Date:** 2026-04-25
**Target Version:** v0.5 (Internal Prototype)

---

## 1. Goal

Deliver a functional, graph-native PKM prototype that demonstrates meta-circularity, event-sourced projection, and real-time synchronization.

---

## 2. Core Pillars

### 2.1 Everything is a Node (Completed)

- [x] NodeType, EdgeType, PropertyType definitions stored as nodes.
- [x] ViewDefinition and Renderer definitions stored as nodes.
- [x] Settings stored as nodes with 5-level cascade resolution.

### 2.2 Event-Sourced Projection (Completed)

- [x] All mutations generate immutable `GraphEvent` records.
- [x] Graph state is a pure projection of the event log.
- [x] Yjs integration for conflict-free event log synchronization.

### 2.3 Fluid Content Model (In Progress)

- [x] Hierarchical block structure using `child_of` edges.
- [x] Meta-circular block rendering (`BlockRenderer`).
- [ ] **Next:** Basic drag-and-drop or keyboard-driven block reordering.
- [ ] **Next:** Yjs `Y.Text` integration for character-level editing within blocks.

### 2.4 Actionable Graph (In Progress)

- [ ] **Next:** Basic Cypher-subset query engine (MATCH/RETURN).
- [ ] **Next:** Triggered workflows (NodeCreated -> Action).
- [ ] **Next:** Basic "Create Edge" and "Set Property" workflow actions.

---

## 3. UI/UX Requirements for Prototype

| Feature        | Description                                       | Status |
| -------------- | ------------------------------------------------- | ------ |
| **Home**       | List/Create/Delete Graphs                         | [x]    |
| **Explorer**   | Sidebar with system views (All, Recent, Types)    | [x]    |
| **Node View**  | Combined document projection + raw data inspector | [x]    |
| **Search**     | Global node search by name/ID                     | [x]    |
| **Graph View** | Visual node-link diagram (using @xyflow/react)    | [x]    |
| **Editor**     | Basic block editing (Markdown/Text/Code)          | [~]    |

---

## 4. Guardrails & Quality (New)

- [ ] **Automated Testing:** 80% coverage on `@canopy/core` and `@canopy/query`.
- [ ] **UI Stability:** Integration tests for core navigation and editing flows.
- [ ] **Linting:** Strict functional and type-safety rules enforced across monorepo.

---

## 5. Milestone: Internal Alpha

Target: 2026-05-15

- All "Next" items in Section 2 completed.
- UI stable enough for daily note-taking by the development team.
