# @canopy/schema

Zod schemas and TypeScript types for the Graph data model.

## Installation

```bash
pnpm add @canopy/schema
```

## Types

### Node

```typescript
type Node = {
  id: string; // UUID
  type: string;
  properties: Record<string, any>;
  created: string; // ISO Date
  modified: string; // ISO Date
};
```

### Edge

```typescript
type Edge = {
  id: string; // UUID
  source: string; // Node UUID
  target: string; // Node UUID
  type: string;
  properties: Record<string, any>;
  created: string; // ISO Date
  modified: string; // ISO Date
};
```

### NodeType / EdgeType

Definitions for validating node and edge properties.

```typescript
type PropertyDefinition = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required?: boolean;
};
```
