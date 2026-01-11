This package provides runtime validation and constructors for domain types using Zod.
It includes:

- Branded type constructors (e.g., `createNodeId`).
- Type guards (e.g., `isNode`).
- Zod schemas for all domain types.
- Property map utilities.

Navigation:

- `src/constructors.ts`: Factories for branded types.
- `src/guards.ts`: Type guards for discriminated unions.
- `src/schemas.ts`: Zod schemas bridging runtime data to compile-time types.
- `src/properties.ts`: Utilities for PropertyMap.
