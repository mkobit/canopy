1. **Update `QueryResult` in `@canopy/types`**
   - Modify `packages/types/src/graph.ts` to add an optional `rows` field of type `readonly Readonly<Record<string, unknown>>[]` to `QueryResult`.

2. **Update Query Model in `@canopy/query`**
   - Modify `packages/query/src/model.ts` to include a new `QueryStep` variant: `Readonly<{ kind: 'project'; properties: readonly string[] }>`.

3. **Update Query Pipeline in `@canopy/query`**
   - Modify `packages/query/src/pipeline.ts` to add a `returns` function that appends a `project` step to the query with the specified properties.

4. **Implement Projection Logic in Engine**
   - Modify `packages/query/src/engine.ts` to handle the `project` step, adding a `rows` array to the accumulator. This involves reading the specified properties from the matched graph items and mapping them into result rows (using `remeda`'s `map` and `reduce` to satisfy functional linting rules).
   - Ensure the final `QueryResult` includes the `rows` field if it was set during the query execution.

5. **Write Tests**
   - Add a test case in `packages/query/tests/query.test.ts` to verify that result projection correctly extracts properties into `rows`.
   - Execute `bun test --filter query` to ensure the test passes.

6. **Pre-commit Steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

7. **Submit**
   - Submit the changes with an appropriate message.
