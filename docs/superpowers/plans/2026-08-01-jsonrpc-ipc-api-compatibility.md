# JSON-RPC IPC Schema Baseline & API Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate JSON-RPC IPC schema baseline tracking and regression checking into `@canopy/api-adapter` and `tools/check-api-compatibility.ts`.

**Architecture:** Create an OpenRPC 1.3 spec generator (`JSON_RPC_IPC_SPECIFICATION`) derived from Zod schemas and IPC definitions, maintain a baseline snapshot (`packages/api-adapter/schema-baselines/ipc-openrpc.json`), and implement `checkIpc()` compatibility diffing in `tools/lib/api-compatibility-checker.ts`.

**Tech Stack:** TypeScript, Bun, Zod (`z.toJSONSchema`), OpenRPC 1.3 format.

## Global Constraints

- All TypeScript type properties must be `readonly`.
- Immutable programming: return new objects/arrays instead of mutating.
- Zod schemas in `packages/api-adapter/src/ipc/ipc-schema.ts` are the source of truth.
- Follow existing baseline generator and waiver patterns in `tools/lib/api-compatibility-checker.ts`.

---

### Task 1: OpenRPC Specification Generator & Export (`JSON_RPC_IPC_SPECIFICATION`)

**Files:**
- Create: `packages/api-adapter/src/ipc/ipc-openrpc-spec.ts`
- Modify: `packages/api-adapter/src/ipc/index.ts`
- Modify: `packages/api-adapter/src/index.ts`
- Test: `packages/api-adapter/tests/ipc-openrpc-spec.test.ts`

**Interfaces:**
- Produces: `JSON_RPC_IPC_SPECIFICATION: string` (exported canonical OpenRPC 1.3 JSON string)

- [ ] **Step 1: Write failing test for `JSON_RPC_IPC_SPECIFICATION` export**

Create `packages/api-adapter/tests/ipc-openrpc-spec.test.ts`:
```typescript
import { describe, expect, test } from 'bun:test';
import { JSON_RPC_IPC_SPECIFICATION } from '../src';

describe('OpenRPC Specification Export', () => {
  test('exports valid JSON-RPC 2.0 OpenRPC specification JSON string', () => {
    expect(typeof JSON_RPC_IPC_SPECIFICATION).toBe('string');
    const parsed = JSON.parse(JSON_RPC_IPC_SPECIFICATION) as {
      readonly openrpc: string;
      readonly methods: readonly { readonly name: string }[];
      readonly errors: readonly { readonly code: number }[];
    };
    expect(parsed.openrpc).toBe('1.3.2');
    expect(parsed.methods.some((m) => m.name === 'canopy.v1.query.getNode')).toBe(true);
    expect(parsed.errors.some((e) => e.code === -32000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/ipc-openrpc-spec.test.ts`  
Expected: FAIL with missing `JSON_RPC_IPC_SPECIFICATION` export.

- [ ] **Step 3: Implement OpenRPC spec generator in `ipc-openrpc-spec.ts`**

Create `packages/api-adapter/src/ipc/ipc-openrpc-spec.ts`:
```typescript
import { z } from 'zod';
import {
  IPC_METHODS,
  JSON_RPC_ERROR_CODES,
  HandshakeParamsSchema,
  HandshakeResultSchema,
  GetNodeParamsSchema,
  GetNodesParamsSchema,
  GetEdgeParamsSchema,
  GetEdgesParamsSchema,
  ExecuteQueryParamsSchema,
  CreateNodeParamsSchema,
  UpdateNodePropertiesParamsSchema,
  DeleteNodeParamsSchema,
  CreateEdgeParamsSchema,
  DeleteEdgeParamsSchema,
  SubscribeParamsSchema,
  SubscribeResultSchema,
  UnsubscribeParamsSchema,
  UnsubscribeResultSchema,
  EventNotificationParamsSchema,
} from './ipc-schema.js';

const sortKeysRecursively = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysRecursively);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = sortKeysRecursively(record[key]);
    }
    return result;
  }
  return value;
};

const methodSchemas = [
  { name: IPC_METHODS.HANDSHAKE, params: HandshakeParamsSchema, result: HandshakeResultSchema },
  { name: IPC_METHODS.QUERY_GET_NODE, params: GetNodeParamsSchema },
  { name: IPC_METHODS.QUERY_GET_NODES, params: GetNodesParamsSchema },
  { name: IPC_METHODS.QUERY_GET_EDGE, params: GetEdgeParamsSchema },
  { name: IPC_METHODS.QUERY_GET_EDGES, params: GetEdgesParamsSchema },
  { name: IPC_METHODS.QUERY_EXECUTE_QUERY, params: ExecuteQueryParamsSchema },
  { name: IPC_METHODS.MUTATION_CREATE_NODE, params: CreateNodeParamsSchema },
  { name: IPC_METHODS.MUTATION_UPDATE_NODE_PROPERTIES, params: UpdateNodePropertiesParamsSchema },
  { name: IPC_METHODS.MUTATION_DELETE_NODE, params: DeleteNodeParamsSchema },
  { name: IPC_METHODS.MUTATION_CREATE_EDGE, params: CreateEdgeParamsSchema },
  { name: IPC_METHODS.MUTATION_DELETE_EDGE, params: DeleteEdgeParamsSchema },
  { name: IPC_METHODS.EVENT_STREAM_SUBSCRIBE, params: SubscribeParamsSchema, result: SubscribeResultSchema },
  { name: IPC_METHODS.EVENT_STREAM_UNSUBSCRIBE, params: UnsubscribeParamsSchema, result: UnsubscribeResultSchema },
  { name: IPC_METHODS.EVENT_STREAM_EVENT, params: EventNotificationParamsSchema },
] as const;

const openRpcObject = {
  openrpc: '1.3.2',
  info: {
    title: 'Canopy IPC Protocol Specification',
    version: '0.1.0',
  },
  methods: methodSchemas.map((m) => ({
    name: m.name,
    paramStructure: 'by-name',
    params: Object.entries(
      ((z.toJSONSchema(m.params) as { properties?: Record<string, unknown> }).properties ?? {})
    ).map(([paramName, schema]) => ({
      name: paramName,
      required: ((z.toJSONSchema(m.params) as { required?: readonly string[] }).required ?? []).includes(paramName),
      schema,
    })),
    ...(m.result && { result: { name: 'result', schema: z.toJSONSchema(m.result) } }),
  })),
  errors: Object.entries(JSON_RPC_ERROR_CODES).map(([key, code]) => ({
    code,
    message: key,
  })),
};

export const JSON_RPC_IPC_SPECIFICATION = JSON.stringify(sortKeysRecursively(openRpcObject), null, 2) + '\n';
```

Export `JSON_RPC_IPC_SPECIFICATION` from `packages/api-adapter/src/ipc/index.ts` and `packages/api-adapter/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/ipc-openrpc-spec.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/api-adapter/src/ipc/ipc-openrpc-spec.ts packages/api-adapter/src/ipc/index.ts packages/api-adapter/src/index.ts packages/api-adapter/tests/ipc-openrpc-spec.test.ts
git commit -m "feat(api-adapter): export canonical JSON_RPC_IPC_SPECIFICATION OpenRPC spec"
```

---

### Task 2: Baseline Snapshot & Waiver Schema Updates

**Files:**
- Create: `packages/api-adapter/schema-baselines/ipc-openrpc.json`
- Modify: `packages/api-adapter/schema-baselines/approved-breaking-changes.schema.json`
- Modify: `packages/api-adapter/tests/schema-baselines.test.ts`

- [ ] **Step 1: Update `approved-breaking-changes.schema.json` for `ipc` protocol**

In `packages/api-adapter/schema-baselines/approved-breaking-changes.schema.json`:
Update `"enum": ["graphql", "connect", "wit", "all"]` to `"enum": ["graphql", "connect", "wit", "ipc", "all"]`.

- [ ] **Step 2: Create initial baseline snapshot file `ipc-openrpc.json`**

Generate `packages/api-adapter/schema-baselines/ipc-openrpc.json` containing `JSON_RPC_IPC_SPECIFICATION` prefixed with standard header banner or formatted as string snapshot.

- [ ] **Step 3: Update `schema-baselines.test.ts` to assert IPC baseline snapshot**

Modify `packages/api-adapter/tests/schema-baselines.test.ts` to check `ipc-openrpc.json`:
```typescript
import { CANOPY_WIT_SPECIFICATION, GRAPHQL_SDL_SCHEMA, JSON_RPC_IPC_SPECIFICATION, PROTO_SERVICES_SDL } from '../src';

// Inside test:
const ipcPath = path.join(baselinesDirectory, 'ipc-openrpc.json');
expect(fs.existsSync(ipcPath)).toBe(true);
const ipcContent = fs.readFileSync(ipcPath, 'utf8');
expect(ipcContent).toContain('AUTOGENERATED BASELINE FILE - DO NOT EDIT MANUALLY');
expect(ipcContent).toContain('canopy.v1.query.getNode');
```

- [ ] **Step 4: Run baseline test to verify it passes**

Run: `bun test packages/api-adapter/tests/schema-baselines.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/api-adapter/schema-baselines/ipc-openrpc.json packages/api-adapter/schema-baselines/approved-breaking-changes.schema.json packages/api-adapter/tests/schema-baselines.test.ts
git commit -m "feat(api-adapter): add ipc-openrpc.json baseline snapshot and waiver schema update"
```

---

### Task 3: Compatibility Engine (`checkIpc`) & CLI Integration

**Files:**
- Modify: `tools/lib/api-compatibility-checker.ts`
- Modify: `tools/check-api-compatibility.ts`
- Modify: `docs/architecture/api-compatibility-policy.md`

- [ ] **Step 1: Implement `checkIpc` in `tools/lib/api-compatibility-checker.ts`**

Update `tools/lib/api-compatibility-checker.ts`:
1. Update `Violation['protocol']` and `Waiver['protocol']` to include `'ipc'`.
2. Update `CheckOptions['target']` to `'graphql' | 'connect' | 'wit' | 'ipc' | 'all'`.
3. Implement `checkIpc(liveSchema: string, baselineSchema?: string): readonly Violation[]`:
   - Parse live and baseline OpenRPC JSON objects.
   - Detect removed methods (`METHOD_REMOVAL`).
   - Detect removed error codes (`ERROR_CODE_REMOVAL`).
   - Detect removed parameters (`PARAM_REMOVAL`).
   - Detect parameter tightening (`PARAM_TIGHTENING`).
   - Detect result payload property drops (`RESULT_PROPERTY_REMOVAL`).

- [ ] **Step 2: Update `tools/check-api-compatibility.ts` for target `ipc`**

Update CLI target parsing, baseline updating logic, and waiver generation helper in `tools/check-api-compatibility.ts` to support `ipc`:
```typescript
if (target === 'all' || target === 'ipc') {
  fs.writeFileSync(
    path.join(BASELINES_DIR, 'ipc-openrpc.json'),
    banner +
      JSON_RPC_IPC_SPECIFICATION.replaceAll(
        '/* AUTOGENERATED BASELINE FILE - DO NOT EDIT MANUALLY */\n',
        '',
      ),
  );
}
```

- [ ] **Step 3: Update `docs/architecture/api-compatibility-policy.md`**

Add JSON-RPC IPC transport description and `ipc-openrpc.json` snapshot details to `docs/architecture/api-compatibility-policy.md`.

- [ ] **Step 4: Run verification**

Run: `bun tools/check-api-compatibility.ts`  
Expected: `✅ All API compatibility checks passed across GraphQL, Connect Protobuf, WASM WIT, and JSON-RPC IPC.`

- [ ] **Step 5: Commit Task 3**

```bash
git add tools/lib/api-compatibility-checker.ts tools/check-api-compatibility.ts docs/architecture/api-compatibility-policy.md
git commit -m "feat(tools): integrate JSON-RPC IPC schema checking into check-api-compatibility"
```

---

### Task 4: Regression Tests for IPC Compatibility Checker

**Files:**
- Modify: `packages/api-adapter/tests/api-compatibility.test.ts`

- [ ] **Step 1: Add IPC compatibility regression tests to `api-compatibility.test.ts`**

Add tests for:
1. Method removal detection.
2. Error code removal detection.
3. Parameter tightening/removal detection.
4. Waiver approval with `protocol: 'ipc'`.

```typescript
test('detects breaking IPC method removal', () => {
  const baseline = JSON.parse(JSON_RPC_IPC_SPECIFICATION);
  const modified = {
    ...baseline,
    methods: baseline.methods.filter((m: { name: string }) => m.name !== 'canopy.v1.query.getNode'),
  };
  const result = checkApiCompatibility({
    overrideIpc: JSON.stringify(modified),
  });
  expect(result.success).toBe(false);
  expect(result.violations.some((v) => v.protocol === 'ipc' && v.changeType === 'METHOD_REMOVAL')).toBe(true);
});
```

- [ ] **Step 2: Run all tests & linters**

Run: `bun test`  
Expected: All test suites pass cleanly.

Run: `bun run build && bun run lint && bun run typecheck`  
Expected: Clean pass with 0 errors.

- [ ] **Step 3: Commit Task 4**

```bash
git add packages/api-adapter/tests/api-compatibility.test.ts
git commit -m "test(api-adapter): add IPC compatibility regression tests"
```
