export interface ValidationError {
  readonly path: readonly string[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}
