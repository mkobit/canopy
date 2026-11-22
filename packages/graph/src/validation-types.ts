import type { NodeId, EdgeId } from './identifiers';

export type ValidationSeverity = 'error' | 'warning';

export type ValidationCode =
  | 'SHAPE_NOT_FOUND'
  | 'SHAPE_KIND_MISMATCH'
  | 'SHAPE_INACTIVE'
  | 'SHAPE_MALFORMED'
  | 'PROPERTY_TYPE_NOT_FOUND'
  | 'PROPERTY_TYPE_MALFORMED'
  | 'CARDINALITY_WIDENED'
  | 'REQUIRED_MISSING'
  | 'UNDECLARED_PROPERTY'
  | 'VALUE_KIND'
  | 'CARDINALITY'
  | 'CONSTRAINT'
  | 'DUPLICATE_VALUE'
  | 'REF_TARGET'
  | 'EDGE_ENDPOINT_SHAPE'
  | 'EDGE_NOT_ALLOWED'
  | 'PLUGIN';

export interface ValidationError {
  readonly code: ValidationCode;
  readonly severity: ValidationSeverity;
  readonly entityKind?: 'node' | 'edge' | undefined;
  readonly entityId?: NodeId | EdgeId | undefined;
  readonly path: readonly string[];
  readonly message: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationError[];
}
