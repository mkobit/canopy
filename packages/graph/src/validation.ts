import type { Graph } from './graph';
import type { Node } from './node';
import type { Edge } from './edge';
import type { ShapeDefinition, ShapePropertyBinding } from './definitions';
import type { ValidationCode, ValidationError, ValidationResult } from './validation-types';
import type { PropertyDefinition, PropertyValue, PropertyValueKind } from './properties';
import type { ScalarValue } from './scalars';
import type { NodeId, EdgeId, ShapeId } from './identifiers';
import type { Result } from './result';
import { asNodeId, parsePlainDate } from './factories';
import { ok, err as error, fromThrowable } from './result';
import {
  GraphIdSchema,
  InstantSchema,
  NodeIdSchema,
  PropertyDefinitionSchema,
  ShapePropertyBindingSchema,
} from './schemas';
import { resolveShape } from './queries';
import { SYSTEM_IDS, isSystemNodeId } from './system';
import { canonicalizeUri } from './url';
import { serializeScalarForIndex } from './scalars';
import { pipe, flatMap } from 'remeda';
import { validateWasmBinaryProperty, validatePluginManifestProperty } from './plugin-validation';

const MAX_ARRAY_LENGTH = 10_000;
const MAX_REGEX_PATTERN_LENGTH = 256;
const MAX_REGEX_VALUE_LENGTH = 8192;

const SUCCESS: ValidationResult = { valid: true, errors: [], warnings: [] };

function buildResult(issues: readonly ValidationError[]): ValidationResult {
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function stampEntity(
  issues: readonly ValidationError[],
  entityKind: 'node' | 'edge',
  entityId: NodeId | EdgeId,
): readonly ValidationError[] {
  return issues.map((issue) => ({
    ...issue,
    entityKind,
    entityId,
  }));
}

function isQuantifierChar(ch = ''): boolean {
  return ['+', '*', '?', '{'].includes(ch);
}

function scanNestedQuantifier(
  pattern: string,
  index: number,
  inCharClass: boolean,
  groupQuantifierStack: readonly boolean[],
): boolean {
  if (index >= pattern.length) {
    return false;
  }
  const ch = pattern[index];
  if (ch === '\\') {
    return scanNestedQuantifier(pattern, index + 2, inCharClass, groupQuantifierStack);
  }
  if (inCharClass) {
    return scanNestedQuantifier(pattern, index + 1, ch !== ']', groupQuantifierStack);
  }
  if (ch === '[') {
    return scanNestedQuantifier(pattern, index + 1, true, groupQuantifierStack);
  }
  if (ch === '(') {
    return scanNestedQuantifier(pattern, index + 1, false, [...groupQuantifierStack, false]);
  }
  if (ch === ')') {
    const groupHadQuantifier = groupQuantifierStack.at(-1) ?? false;
    const nextCh = pattern[index + 1];
    if (groupHadQuantifier && isQuantifierChar(nextCh)) {
      return true;
    }
    const parentStack = groupQuantifierStack.slice(0, -1);
    const updatedParent =
      groupHadQuantifier && parentStack.length > 0
        ? [...parentStack.slice(0, -1), true]
        : parentStack;
    return scanNestedQuantifier(pattern, index + 1, false, updatedParent);
  }
  if ((ch === '+' || ch === '*') && groupQuantifierStack.length > 0) {
    const updated = [...groupQuantifierStack.slice(0, -1), true];
    return scanNestedQuantifier(pattern, index + 1, false, updated);
  }
  return scanNestedQuantifier(pattern, index + 1, false, groupQuantifierStack);
}

function compileSafeRegex(pattern: string): Result<RegExp, string> {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return error(`Regex pattern exceeds maximum length of ${MAX_REGEX_PATTERN_LENGTH} characters`);
  }
  if (scanNestedQuantifier(pattern, 0, false, [])) {
    return error(`Regex pattern '${pattern}' contains nested quantifiers (ReDoS risk)`);
  }
  const rxResult = fromThrowable(() => new RegExp(pattern));
  return rxResult.ok ? ok(rxResult.value) : error(`Invalid regular expression '${pattern}'`);
}

export function validatePropertyConstraints(
  definition: PropertyDefinition,
  code: ValidationCode = 'CONSTRAINT',
): readonly ValidationError[] {
  const regexErrors: readonly ValidationError[] = (() => {
    if (definition.regex === undefined) return [];
    const rxResult = compileSafeRegex(definition.regex);
    return rxResult.ok
      ? []
      : [
          {
            code,
            severity: 'error',
            path: [definition.name, 'regex'],
            message: rxResult.error,
            expected: 'safe valid regex',
            actual: definition.regex,
          },
        ];
  })();

  const uriErrors: readonly ValidationError[] = (() => {
    if (definition.schemaOrgUri === undefined) return [];
    const uriResult = canonicalizeUri(definition.schemaOrgUri);
    return uriResult.ok
      ? []
      : [
          {
            code,
            severity: 'error',
            path: [definition.name, 'schemaOrgUri'],
            message: uriResult.error.message,
            expected: 'valid canonical URI',
            actual: definition.schemaOrgUri,
          },
        ];
  })();

  return [...regexErrors, ...uriErrors];
}

function parseChoices(value: PropertyValue | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string') {
    const parsed = fromThrowable(() => JSON.parse(value));
    if (parsed.ok && Array.isArray(parsed.value)) {
      return parsed.value.map(String);
    }
  }
  return undefined;
}

export function extractPropertyTypeDefinition(
  node: Node,
): Result<PropertyDefinition, readonly ValidationError[]> {
  const name = node.properties.get('name');
  if (typeof name !== 'string' || name.length === 0) {
    return error([
      {
        code: 'PROPERTY_TYPE_MALFORMED',
        severity: 'error',
        path: ['name'],
        message: `PropertyType '${node.id}' missing valid 'name'`,
      },
    ]);
  }

  const rawTargetShape =
    node.properties.get('targetShapeId') ?? node.properties.get('targetTypeId');
  const candidate = {
    name,
    valueKind: node.properties.get('valueKind'),
    required: false,
    description:
      typeof node.properties.get('description') === 'string'
        ? (node.properties.get('description') as string)
        : undefined,
    cardinality: node.properties.get('cardinality'),
    unique: node.properties.get('unique'),
    nullable: node.properties.get('nullable'),
    choices: parseChoices(node.properties.get('choices')),
    targetShapeId: typeof rawTargetShape === 'string' ? rawTargetShape : undefined,
    regex: node.properties.get('regex'),
    min: node.properties.get('min'),
    max: node.properties.get('max'),
    schemaOrgUri: node.properties.get('schemaOrgUri'),
  };

  const parsed = PropertyDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    return error(
      parsed.error.issues.map((issue) => ({
        code: 'PROPERTY_TYPE_MALFORMED' as const,
        severity: 'error' as const,
        path: issue.path.map(String),
        message: issue.message,
      })),
    );
  }

  const constraintErrors = validatePropertyConstraints(parsed.data, 'PROPERTY_TYPE_MALFORMED');
  return constraintErrors.length > 0 ? error(constraintErrors) : ok(parsed.data);
}

function validateRegex(
  value: PropertyValue,
  name: string,
  rxString: string,
): readonly ValidationError[] {
  const rxResult = compileSafeRegex(rxString);
  if (!rxResult.ok) {
    return [
      {
        code: 'CONSTRAINT',
        severity: 'error',
        path: [name],
        message: rxResult.error,
        expected: 'valid regex',
        actual: rxString,
      },
    ];
  }

  const rx = rxResult.value;
  if (typeof value === 'string') {
    if (value.length > MAX_REGEX_VALUE_LENGTH) {
      return [
        {
          code: 'CONSTRAINT',
          severity: 'error',
          path: [name],
          message: `Property '${name}' is too long for pattern validation (max ${MAX_REGEX_VALUE_LENGTH} characters)`,
          expected: `<= ${MAX_REGEX_VALUE_LENGTH} characters`,
          actual: String(value.length),
        },
      ];
    }
    if (!rx.test(value)) {
      return [
        {
          code: 'CONSTRAINT',
          severity: 'error',
          path: [name],
          message: `Property '${name}' does not match the required pattern`,
          expected: rxString,
          actual: value,
        },
      ];
    }
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index): ValidationError | null => {
        if (item === null) return null;
        if (typeof item !== 'string') {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} does not match the required pattern`,
            expected: rxString,
            actual: String(item),
          };
        }
        if (item.length > MAX_REGEX_VALUE_LENGTH) {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} is too long for pattern validation (max ${MAX_REGEX_VALUE_LENGTH} characters)`,
            expected: `<= ${MAX_REGEX_VALUE_LENGTH} characters`,
            actual: String(item.length),
          };
        }
        if (!rx.test(item)) {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} does not match the required pattern`,
            expected: rxString,
            actual: item,
          };
        }
        return null;
      })
      .filter((issue): issue is ValidationError => issue !== null);
  }
  return [];
}

function validateChoices(
  value: PropertyValue,
  name: string,
  choices: readonly string[],
): readonly ValidationError[] {
  const isMatch = (item: unknown): boolean => choices.includes(String(item));

  if (
    (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
    !isMatch(value)
  ) {
    return [
      {
        code: 'CONSTRAINT',
        severity: 'error',
        path: [name],
        message: `Property '${name}' must be one of the allowed choices`,
        expected: choices.join(', '),
        actual: String(value),
      },
    ];
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index): ValidationError | null => {
        if (item === null) return null;
        if (!isMatch(item)) {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} must be one of the allowed choices`,
            expected: choices.join(', '),
            actual: String(item),
          };
        }
        return null;
      })
      .filter((issue): issue is ValidationError => issue !== null);
  }
  return [];
}

function validateReferenceTargets(
  value: PropertyValue,
  name: string,
  targetShapeId: ShapeId | undefined,
  graph: Graph | undefined,
): readonly ValidationError[] {
  if (graph === undefined) {
    return [];
  }

  const checkReference = (targetIdString: string, indexPath?: string): ValidationError | null => {
    const targetNodeId = asNodeId(targetIdString);
    const targetNode = graph.nodes.get(targetNodeId);
    const path = indexPath === undefined ? [name] : [name, indexPath];

    if (targetNode === undefined) {
      return {
        code: 'REF_TARGET',
        severity: 'error',
        path,
        message: `Property '${name}' target node '${targetIdString}' not found in graph`,
        expected: targetShapeId ?? 'existing node',
        actual: 'not_found',
      };
    }

    if (targetShapeId !== undefined && targetNode.shape !== targetShapeId) {
      return {
        code: 'REF_TARGET',
        severity: 'error',
        path,
        message: `Property '${name}' target node '${targetIdString}' has shape '${targetNode.shape ?? 'open'}', expected '${targetShapeId}'`,
        expected: targetShapeId,
        actual: targetNode.shape ?? 'open',
      };
    }

    return null;
  };

  if (typeof value === 'string') {
    const issue = checkReference(value);
    return issue === null ? [] : [issue];
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index): ValidationError | null => {
        if (item === null) return null;
        if (typeof item === 'string') {
          return checkReference(item, String(index));
        }
        return {
          code: 'REF_TARGET',
          severity: 'error',
          path: [name, String(index)],
          message: `Property '${name}' element at index ${index} must be a reference string`,
          expected: 'reference',
          actual: typeof item,
        };
      })
      .filter((issue): issue is ValidationError => issue !== null);
  }

  return [];
}

function validateMin(
  value: PropertyValue,
  definition: PropertyDefinition,
  limit: number,
): readonly ValidationError[] {
  const { name } = definition;
  if (typeof value === 'number' && value < limit) {
    return [
      {
        code: 'CONSTRAINT',
        severity: 'error',
        path: [name],
        message: `Property '${name}' must be at least ${limit}`,
        expected: `>= ${limit}`,
        actual: String(value),
      },
    ];
  }
  if (typeof value === 'string' && value.length < limit) {
    return [
      {
        code: 'CONSTRAINT',
        severity: 'error',
        path: [name],
        message: `Property '${name}' must be at least ${limit} characters long`,
        expected: `>= ${limit}`,
        actual: String(value.length),
      },
    ];
  }
  if (Array.isArray(value)) {
    if (definition.valueKind === 'list') {
      return value.length < limit
        ? [
            {
              code: 'CONSTRAINT',
              severity: 'error',
              path: [name],
              message: `Property '${name}' must contain at least ${limit} items`,
              expected: `>= ${limit}`,
              actual: String(value.length),
            },
          ]
        : [];
    }
    return value
      .map((item, index): ValidationError | null => {
        if (typeof item === 'number' && item < limit) {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} must be at least ${limit}`,
            expected: `>= ${limit}`,
            actual: String(item),
          };
        }
        if (typeof item === 'string' && item.length < limit) {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} must be at least ${limit} characters long`,
            expected: `>= ${limit}`,
            actual: String(item.length),
          };
        }
        return null;
      })
      .filter((issue): issue is ValidationError => issue !== null);
  }
  return [];
}

function validateMax(
  value: PropertyValue,
  definition: PropertyDefinition,
  limit: number,
): readonly ValidationError[] {
  const { name } = definition;
  if (typeof value === 'number' && value > limit) {
    return [
      {
        code: 'CONSTRAINT',
        severity: 'error',
        path: [name],
        message: `Property '${name}' must be at most ${limit}`,
        expected: `<= ${limit}`,
        actual: String(value),
      },
    ];
  }
  if (typeof value === 'string' && value.length > limit) {
    return [
      {
        code: 'CONSTRAINT',
        severity: 'error',
        path: [name],
        message: `Property '${name}' must be at most ${limit} characters long`,
        expected: `<= ${limit}`,
        actual: String(value.length),
      },
    ];
  }
  if (Array.isArray(value)) {
    if (definition.valueKind === 'list') {
      return value.length > limit
        ? [
            {
              code: 'CONSTRAINT',
              severity: 'error',
              path: [name],
              message: `Property '${name}' must contain at most ${limit} items`,
              expected: `<= ${limit}`,
              actual: String(value.length),
            },
          ]
        : [];
    }
    return value
      .map((item, index): ValidationError | null => {
        if (typeof item === 'number' && item > limit) {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} must be at most ${limit}`,
            expected: `<= ${limit}`,
            actual: String(item),
          };
        }
        if (typeof item === 'string' && item.length > limit) {
          return {
            code: 'CONSTRAINT',
            severity: 'error',
            path: [name, String(index)],
            message: `Property '${name}' element at index ${index} must be at most ${limit} characters long`,
            expected: `<= ${limit}`,
            actual: String(item.length),
          };
        }
        return null;
      })
      .filter((issue): issue is ValidationError => issue !== null);
  }
  return [];
}

function isScalarKindValid(value_: unknown, valueKind: PropertyValueKind): boolean {
  if (valueKind === 'list') {
    return true;
  }
  switch (valueKind) {
    case 'text':
    case 'instant':
    case 'plain-date':
    case 'url':
    case 'reference': {
      return typeof value_ === 'string';
    }
    case 'number':
    case 'integer': {
      return typeof value_ === 'number';
    }
    case 'boolean': {
      return typeof value_ === 'boolean';
    }
    case 'external-reference': {
      return (
        typeof value_ === 'object' && value_ !== null && 'graph' in value_ && 'target' in value_
      );
    }
    default: {
      return false;
    }
  }
}

function validateScalarFormat(
  item: ScalarValue,
  valueKind: PropertyValueKind,
  path: readonly string[],
): ValidationError | null {
  switch (valueKind) {
    case 'number': {
      return typeof item === 'number' && Number.isFinite(item)
        ? null
        : {
            code: 'CONSTRAINT',
            severity: 'error',
            path,
            message: `Expected a finite number`,
            expected: 'finite number',
            actual: String(item),
          };
    }
    case 'integer': {
      return typeof item === 'number' && Number.isSafeInteger(item)
        ? null
        : {
            code: 'CONSTRAINT',
            severity: 'error',
            path,
            message: `Expected a safe integer`,
            expected: 'safe integer',
            actual: String(item),
          };
    }
    case 'instant': {
      return InstantSchema.safeParse(item).success
        ? null
        : {
            code: 'CONSTRAINT',
            severity: 'error',
            path,
            message: `Expected an ISO 8601 instant with offset`,
            expected: 'ISO 8601 instant',
            actual: String(item),
          };
    }
    case 'plain-date': {
      return typeof item === 'string' && parsePlainDate(item).ok
        ? null
        : {
            code: 'CONSTRAINT',
            severity: 'error',
            path,
            message: `Expected a valid YYYY-MM-DD plain date`,
            expected: 'YYYY-MM-DD',
            actual: String(item),
          };
    }
    case 'url': {
      if (typeof item !== 'string') return null;
      const uriResult = canonicalizeUri(item);
      return uriResult.ok
        ? null
        : {
            code: 'CONSTRAINT',
            severity: 'error',
            path,
            message: uriResult.error.message,
            expected: 'valid safe URI',
            actual: item,
          };
    }
    case 'external-reference': {
      if (typeof item !== 'object' || item === null) return null;
      const valid =
        GraphIdSchema.safeParse(item.graph).success && NodeIdSchema.safeParse(item.target).success;
      return valid
        ? null
        : {
            code: 'CONSTRAINT',
            severity: 'error',
            path,
            message: `Invalid external reference (graph must be UUID, target must be non-empty)`,
          };
    }
    case 'boolean':
    case 'text':
    case 'reference':
    case 'list': {
      return null;
    }
    default: {
      return null;
    }
  }
}

function validateValueType(
  value: PropertyValue,
  definition: PropertyDefinition,
): readonly ValidationError[] {
  const expectedCardinality =
    definition.cardinality ?? (definition.valueKind === 'list' ? 'many' : 'one');

  if (expectedCardinality === 'many') {
    if (!Array.isArray(value)) {
      return [
        {
          code: 'CARDINALITY',
          severity: 'error',
          path: [definition.name],
          message: `Property '${definition.name}' expected cardinality 'many' but got scalar value`,
          expected: 'list',
          actual: typeof value,
        },
      ];
    }
    if (value.length > MAX_ARRAY_LENGTH) {
      return [
        {
          code: 'CARDINALITY',
          severity: 'error',
          path: [definition.name],
          message: `Property '${definition.name}' exceeds maximum array length of ${MAX_ARRAY_LENGTH} items`,
          expected: `<= ${MAX_ARRAY_LENGTH} items`,
          actual: String(value.length),
        },
      ];
    }
  } else if (Array.isArray(value)) {
    return [
      {
        code: 'CARDINALITY',
        severity: 'error',
        path: [definition.name],
        message: `Property '${definition.name}' expected cardinality 'one' but got list value`,
        expected: 'scalar',
        actual: 'list',
      },
    ];
  }

  if (Array.isArray(value)) {
    const invalidElementIndex = value.findIndex(
      (item) =>
        (item !== null || definition.nullable !== true) &&
        !isScalarKindValid(item, definition.valueKind),
    );
    if (invalidElementIndex !== -1) {
      const item = value[invalidElementIndex];
      return [
        {
          code: 'VALUE_KIND',
          severity: 'error',
          path: [definition.name, String(invalidElementIndex)],
          message: `Property '${definition.name}' element at index ${invalidElementIndex} expected type '${definition.valueKind}' but got incompatible value`,
          expected: definition.valueKind,
          actual: item === null ? 'null' : typeof item,
        },
      ];
    }
  } else if (!isScalarKindValid(value, definition.valueKind)) {
    return [
      {
        code: 'VALUE_KIND',
        severity: 'error',
        path: [definition.name],
        message: `Property '${definition.name}' expected type '${definition.valueKind}' but got incompatible value`,
        expected: definition.valueKind,
        actual: value === null ? 'null' : typeof value,
      },
    ];
  }

  return [];
}

function validateUniqueItems(
  value: PropertyValue,
  definition: PropertyDefinition,
): readonly ValidationError[] {
  if (definition.unique !== true || !Array.isArray(value)) {
    return [];
  }
  const serialized = value.map((item) => serializeScalarForIndex(item as ScalarValue));
  return serialized
    .map((key, index): ValidationError | null =>
      serialized.indexOf(key) === index
        ? null
        : {
            code: 'DUPLICATE_VALUE',
            severity: 'error',
            path: [definition.name, String(index)],
            message: `Property '${definition.name}' contains duplicate value at index ${index}`,
            expected: 'unique items',
            actual: String(value[index]),
          },
    )
    .filter((issue): issue is ValidationError => issue !== null);
}

function validateValue(
  value: PropertyValue,
  definition: PropertyDefinition,
  graph?: Graph,
): readonly ValidationError[] {
  if (value === null && definition.nullable === true) {
    return [];
  }

  const typeErrors = validateValueType(value, definition);
  if (typeErrors.length > 0) {
    return typeErrors;
  }

  const formatErrors: readonly ValidationError[] = Array.isArray(value)
    ? value
        .map((item, index) =>
          item === null && definition.nullable === true
            ? null
            : validateScalarFormat(item as ScalarValue, definition.valueKind, [
                definition.name,
                String(index),
              ]),
        )
        .filter((issue): issue is ValidationError => issue !== null)
    : (() => {
        const issue = validateScalarFormat(value as ScalarValue, definition.valueKind, [
          definition.name,
        ]);
        return issue === null ? [] : [issue];
      })();

  const regexErrors =
    definition.regex === undefined ? [] : validateRegex(value, definition.name, definition.regex);
  const choicesErrors =
    definition.choices === undefined
      ? []
      : validateChoices(value, definition.name, definition.choices);
  const minErrors =
    definition.min === undefined ? [] : validateMin(value, definition, definition.min);
  const maxErrors =
    definition.max === undefined ? [] : validateMax(value, definition, definition.max);
  const uniqueErrors = validateUniqueItems(value, definition);
  const targetShapeId = definition.targetShapeId ?? definition.targetTypeId;
  const referenceErrors =
    definition.valueKind === 'reference'
      ? validateReferenceTargets(value, definition.name, targetShapeId, graph)
      : [];

  return [
    ...formatErrors,
    ...regexErrors,
    ...choicesErrors,
    ...minErrors,
    ...maxErrors,
    ...uniqueErrors,
    ...referenceErrors,
  ];
}

function resolveSingleBinding(
  graph: Graph,
  binding: ShapePropertyBinding,
): Readonly<{
  definition?: PropertyDefinition | undefined;
  errors: readonly ValidationError[];
}> {
  if (binding.kind === 'inline') {
    return { definition: binding.definition, errors: [] };
  }
  const ptNode = graph.nodes.get(asNodeId(binding.propertyTypeId));
  if (!ptNode || ptNode.shape !== SYSTEM_IDS.PROPERTY_TYPE) {
    return {
      errors: [
        {
          code: 'PROPERTY_TYPE_NOT_FOUND',
          severity: 'error',
          path: [binding.name],
          message: `Referenced PropertyType '${binding.propertyTypeId}' not found`,
          expected: binding.propertyTypeId,
          actual: ptNode === undefined ? 'not_found' : (ptNode.shape ?? 'open'),
        },
      ],
    };
  }

  const ptResult = extractPropertyTypeDefinition(ptNode);
  if (!ptResult.ok) {
    return { errors: ptResult.error };
  }

  const pt = ptResult.value;
  const ptCardinality = pt.cardinality ?? (pt.valueKind === 'list' ? 'many' : 'one');
  if (ptCardinality === 'one' && binding.cardinality === 'many') {
    return {
      errors: [
        {
          code: 'CARDINALITY_WIDENED',
          severity: 'error',
          path: [binding.name],
          message: `Binding '${binding.name}' cannot widen PropertyType '${binding.propertyTypeId}' cardinality from 'one' to 'many'`,
          expected: 'one',
          actual: 'many',
        },
      ],
    };
  }

  return {
    definition: {
      ...pt,
      name: binding.name,
      required: binding.required,
      cardinality: binding.cardinality ?? ptCardinality,
      description: binding.description ?? pt.description,
    },
    errors: [],
  };
}

function resolveBindings(
  graph: Graph,
  bindings: readonly ShapePropertyBinding[],
): Readonly<{
  definitions: readonly PropertyDefinition[];
  errors: readonly ValidationError[];
}> {
  const results = bindings.map((binding) => resolveSingleBinding(graph, binding));
  return {
    definitions: results
      .map((item) => item.definition)
      .filter((definition): definition is PropertyDefinition => definition !== undefined),
    errors: results.flatMap((item) => item.errors),
  };
}

function validateProperties(
  properties: ReadonlyMap<string, PropertyValue>,
  definitions: readonly PropertyDefinition[],
  closed: boolean,
  graph?: Graph,
): readonly ValidationError[] {
  const bindingErrors = pipe(
    definitions,
    flatMap((propertyDefinition): readonly ValidationError[] => {
      const value = properties.get(propertyDefinition.name);

      if (value === undefined && propertyDefinition.required) {
        return [
          {
            code: 'REQUIRED_MISSING',
            severity: 'error',
            path: [propertyDefinition.name],
            message: `Missing required property '${propertyDefinition.name}'`,
            expected: 'defined',
            actual: 'undefined',
          },
        ];
      }

      if (value === null && propertyDefinition.required && propertyDefinition.nullable !== true) {
        return [
          {
            code: 'REQUIRED_MISSING',
            severity: 'error',
            path: [propertyDefinition.name],
            message: `Required non-nullable property '${propertyDefinition.name}' cannot be null`,
            expected: 'non-null',
            actual: 'null',
          },
        ];
      }

      return value === undefined ? [] : validateValue(value, propertyDefinition, graph);
    }),
  );

  if (!closed) {
    return bindingErrors;
  }

  const declaredNames = new Set(definitions.map((definition) => definition.name));
  const undeclaredErrors: readonly ValidationError[] = [...properties.keys()]
    .filter((key) => !declaredNames.has(key))
    .map((key) => ({
      code: 'UNDECLARED_PROPERTY',
      severity: 'error',
      path: [key],
      message: `Property '${key}' is not declared on closed shape`,
    }));

  return [...bindingErrors, ...undeclaredErrors];
}

function validateShapePropertiesField(node: Node): readonly ValidationError[] {
  const rawProperties = node.properties.get('properties');
  if (rawProperties === undefined) return [];
  if (typeof rawProperties !== 'string') {
    return [
      {
        code: 'SHAPE_MALFORMED',
        severity: 'error',
        path: ['properties'],
        message: `Shape '${node.id}' properties must be a JSON string`,
      },
    ];
  }
  const parsedJson = fromThrowable(() => JSON.parse(rawProperties));
  if (!parsedJson.ok || !Array.isArray(parsedJson.value)) {
    return [
      {
        code: 'SHAPE_MALFORMED',
        severity: 'error',
        path: ['properties'],
        message: `Shape '${node.id}' properties must be a JSON array`,
      },
    ];
  }
  const parsedBindings = ShapePropertyBindingSchema.array().safeParse(parsedJson.value);
  if (!parsedBindings.success) {
    return parsedBindings.error.issues.map((issue) => ({
      code: 'SHAPE_MALFORMED' as const,
      severity: 'error' as const,
      path: ['properties', ...issue.path.map(String)],
      message: issue.message,
    }));
  }
  return parsedBindings.data.flatMap((binding) =>
    binding.kind === 'inline'
      ? validatePropertyConstraints(binding.definition, 'SHAPE_MALFORMED')
      : [],
  );
}

function validateShapeMetaNode(
  node: Node,
  mode: 'create' | 'update',
  previousNode: Node | undefined,
): readonly ValidationError[] {
  const entityKind = node.properties.get('entityKind');
  const entityKindErrors: readonly ValidationError[] =
    entityKind === 'node' || entityKind === 'edge'
      ? []
      : [
          {
            code: 'SHAPE_MALFORMED',
            severity: 'error',
            path: ['entityKind'],
            message: `Shape '${node.id}' must specify entityKind 'node' or 'edge'`,
            expected: 'node | edge',
            actual: String(entityKind),
          },
        ];

  const immutableEntityKindErrors: readonly ValidationError[] = (() => {
    if (mode !== 'update' || previousNode === undefined) return [];
    const previousKind = previousNode.properties.get('entityKind');
    if (entityKind !== previousKind && (previousKind === 'node' || previousKind === 'edge')) {
      return [
        {
          code: 'SHAPE_MALFORMED',
          severity: 'error',
          path: ['entityKind'],
          message: `Cannot change Shape '${node.id}' entityKind from '${previousKind}' to '${String(entityKind)}'`,
          expected: previousKind,
          actual: String(entityKind),
        },
      ];
    }
    return [];
  })();

  const rawSchemaOrgUri = node.properties.get('schemaOrgUri');
  const schemaOrgUriErrors: readonly ValidationError[] = (() => {
    if (rawSchemaOrgUri === undefined) return [];
    if (typeof rawSchemaOrgUri !== 'string') {
      return [
        {
          code: 'SHAPE_MALFORMED',
          severity: 'error',
          path: ['schemaOrgUri'],
          message: `Shape '${node.id}' schemaOrgUri must be a string`,
        },
      ];
    }
    const uri = canonicalizeUri(rawSchemaOrgUri);
    return uri.ok
      ? []
      : [
          {
            code: 'SHAPE_MALFORMED',
            severity: 'error',
            path: ['schemaOrgUri'],
            message: uri.error.message,
          },
        ];
  })();

  return [
    ...entityKindErrors,
    ...immutableEntityKindErrors,
    ...schemaOrgUriErrors,
    ...validateShapePropertiesField(node),
  ];
}

function validateMetaNodeSelf(
  node: Node,
  mode: 'create' | 'update',
  previousNode: Node | undefined,
): readonly ValidationError[] {
  if (node.shape === SYSTEM_IDS.SHAPE) {
    return validateShapeMetaNode(node, mode, previousNode);
  }

  if (node.shape === SYSTEM_IDS.PROPERTY_TYPE) {
    const ptResult = extractPropertyTypeDefinition(node);
    return ptResult.ok ? [] : ptResult.error;
  }

  return [];
}

function validatePluginProperties(node: Node): readonly ValidationError[] {
  if (node.shape !== SYSTEM_IDS.TYPE_PLUGIN) {
    return [];
  }
  const wasmBinaryValue = node.properties.get('wasm_binary');
  const manifestValue = node.properties.get('manifest');
  const isExemptPlaceholder = isSystemNodeId(node.id) && wasmBinaryValue === '';

  return [
    ...(wasmBinaryValue === undefined || isExemptPlaceholder
      ? []
      : validateWasmBinaryProperty(wasmBinaryValue, 'wasm_binary')),
    ...(manifestValue === undefined
      ? []
      : validatePluginManifestProperty(manifestValue, 'manifest')),
  ];
}

export function validateNode(
  graph: Graph,
  node: Node,
  mode: 'create' | 'update' = 'create',
  previousNode?: Node | undefined,
): ValidationResult {
  if (node.shape === undefined) {
    return SUCCESS;
  }

  const shapeResult = resolveShape(graph, node.shape);
  if (!shapeResult.ok) {
    return buildResult(
      stampEntity(
        [
          {
            code: shapeResult.error.code,
            severity: 'error',
            path: ['shape'],
            message: shapeResult.error.message,
          },
        ],
        'node',
        node.id,
      ),
    );
  }

  const definition = shapeResult.value;
  if (definition.entityKind !== 'node') {
    return buildResult(
      stampEntity(
        [
          {
            code: 'SHAPE_KIND_MISMATCH',
            severity: 'error',
            path: ['shape'],
            message: `Shape '${node.shape}' has entityKind '${definition.entityKind}', expected 'node'`,
            expected: 'node',
            actual: definition.entityKind,
          },
        ],
        'node',
        node.id,
      ),
    );
  }

  const inactiveIssues: readonly ValidationError[] =
    definition.status === 'inactive'
      ? [
          {
            code: 'SHAPE_INACTIVE',
            severity: mode === 'create' ? 'error' : 'warning',
            path: ['shape'],
            message: `Shape '${node.shape}' is inactive`,
            expected: 'active',
            actual: 'inactive',
          },
        ]
      : [];

  const resolved = resolveBindings(graph, definition.properties);
  const propertyErrors = validateProperties(
    node.properties,
    resolved.definitions,
    definition.closed,
    graph,
  );
  const pluginErrors = validatePluginProperties(node);
  const metaErrors = validateMetaNodeSelf(node, mode, previousNode);

  return buildResult(
    stampEntity(
      [...inactiveIssues, ...resolved.errors, ...propertyErrors, ...pluginErrors, ...metaErrors],
      'node',
      node.id,
    ),
  );
}

export function matchesCondition(
  payload: Readonly<Record<string, unknown>>,
  conditionJson: string,
): boolean {
  const result = fromThrowable(() => JSON.parse(conditionJson));

  if (!result.ok) {
    return false;
  }

  const condition = result.value;

  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
    return false;
  }

  const conditionRecord = condition as Readonly<Record<string, unknown>>;
  return Object.entries(conditionRecord).every(([key, value]) => payload[key] === value);
}

export function validatePropertyByType(
  graph: Graph,
  propertyTypeId: NodeId,
  value: PropertyValue,
): ValidationResult {
  const definitionNode = graph.nodes.get(propertyTypeId);
  if (!definitionNode || definitionNode.shape !== SYSTEM_IDS.PROPERTY_TYPE) {
    return buildResult([
      {
        code: 'PROPERTY_TYPE_NOT_FOUND',
        severity: 'error',
        path: [propertyTypeId],
        message: `PropertyType node '${propertyTypeId}' not found`,
      },
    ]);
  }

  const ptResult = extractPropertyTypeDefinition(definitionNode);
  if (!ptResult.ok) {
    return buildResult(ptResult.error);
  }

  const definition: PropertyDefinition = {
    ...ptResult.value,
    required: true,
  };
  return buildResult(validateValue(value, definition, graph));
}

export function isEdgeCompatible(
  definition: ShapeDefinition,
  sourceShape: ShapeId,
  targetShape: ShapeId,
): boolean {
  const edgeExtras = definition.edge;
  if (!edgeExtras) {
    return true;
  }
  const isSourceOk =
    edgeExtras.sourceTypes.length === 0 || edgeExtras.sourceTypes.includes(sourceShape);
  const isTargetOk =
    edgeExtras.targetTypes.length === 0 || edgeExtras.targetTypes.includes(targetShape);
  return isSourceOk && isTargetOk;
}

function validateNodeShapeEdgeConstraints(graph: Graph, edge: Edge): readonly ValidationError[] {
  const sourceNode = graph.nodes.get(edge.source);
  const targetNode = graph.nodes.get(edge.target);

  const sourceWarnings: readonly ValidationError[] = (() => {
    if (!sourceNode || sourceNode.shape === undefined) return [];
    const sourceShape = resolveShape(graph, sourceNode.shape);
    if (!sourceShape.ok || sourceShape.value.node === undefined) return [];
    const { validOutgoingEdges } = sourceShape.value.node;
    if (
      validOutgoingEdges.length === 0 ||
      (edge.shape !== undefined && validOutgoingEdges.includes(edge.shape))
    ) {
      return [];
    }
    return [
      {
        code: 'EDGE_NOT_ALLOWED',
        severity: 'warning',
        path: ['source'],
        message: `Source node shape '${sourceShape.value.name}' does not allow outgoing edge shape '${edge.shape ?? 'open'}'`,
        expected: validOutgoingEdges.join(' | '),
        actual: edge.shape ?? 'open',
      },
    ];
  })();

  const targetWarnings: readonly ValidationError[] = (() => {
    if (!targetNode || targetNode.shape === undefined) return [];
    const targetShape = resolveShape(graph, targetNode.shape);
    if (!targetShape.ok || targetShape.value.node === undefined) return [];
    const { validIncomingEdges } = targetShape.value.node;
    if (
      validIncomingEdges.length === 0 ||
      (edge.shape !== undefined && validIncomingEdges.includes(edge.shape))
    ) {
      return [];
    }
    return [
      {
        code: 'EDGE_NOT_ALLOWED',
        severity: 'warning',
        path: ['target'],
        message: `Target node shape '${targetShape.value.name}' does not allow incoming edge shape '${edge.shape ?? 'open'}'`,
        expected: validIncomingEdges.join(' | '),
        actual: edge.shape ?? 'open',
      },
    ];
  })();

  return [...sourceWarnings, ...targetWarnings];
}

function validateEdgeEndpointShapes(
  graph: Graph,
  edge: Edge,
  definition: ShapeDefinition,
): readonly ValidationError[] {
  const edgeExtras = definition.edge;
  if (!edgeExtras || edge.shape === undefined) {
    return [];
  }
  const sourceNode = graph.nodes.get(edge.source);
  const targetNode = graph.nodes.get(edge.target);

  const sourceWarnings: readonly ValidationError[] =
    sourceNode &&
    edgeExtras.sourceTypes.length > 0 &&
    (sourceNode.shape === undefined || !edgeExtras.sourceTypes.includes(sourceNode.shape))
      ? [
          {
            code: 'EDGE_ENDPOINT_SHAPE',
            severity: 'warning',
            path: ['source'],
            message: `Source node shape '${sourceNode.shape ?? 'open'}' is not allowed for edge shape '${edge.shape}'`,
            expected: edgeExtras.sourceTypes.join(' | '),
            actual: sourceNode.shape ?? 'open',
          },
        ]
      : [];

  const targetWarnings: readonly ValidationError[] =
    targetNode &&
    edgeExtras.targetTypes.length > 0 &&
    (targetNode.shape === undefined || !edgeExtras.targetTypes.includes(targetNode.shape))
      ? [
          {
            code: 'EDGE_ENDPOINT_SHAPE',
            severity: 'warning',
            path: ['target'],
            message: `Target node shape '${targetNode.shape ?? 'open'}' is not allowed for edge shape '${edge.shape}'`,
            expected: edgeExtras.targetTypes.join(' | '),
            actual: targetNode.shape ?? 'open',
          },
        ]
      : [];

  return [...sourceWarnings, ...targetWarnings];
}

export function validateEdge(
  graph: Graph,
  edge: Edge,
  mode: 'create' | 'update' = 'create',
): ValidationResult {
  if (edge.shape === undefined) {
    return SUCCESS;
  }

  const shapeResult = resolveShape(graph, edge.shape);
  if (!shapeResult.ok) {
    return buildResult(
      stampEntity(
        [
          {
            code: shapeResult.error.code,
            severity: 'error',
            path: ['shape'],
            message: shapeResult.error.message,
          },
        ],
        'edge',
        edge.id,
      ),
    );
  }

  const definition = shapeResult.value;
  if (definition.entityKind !== 'edge') {
    return buildResult(
      stampEntity(
        [
          {
            code: 'SHAPE_KIND_MISMATCH',
            severity: 'error',
            path: ['shape'],
            message: `Shape '${edge.shape}' has entityKind '${definition.entityKind}', expected 'edge'`,
            expected: 'edge',
            actual: definition.entityKind,
          },
        ],
        'edge',
        edge.id,
      ),
    );
  }

  const inactiveIssues: readonly ValidationError[] =
    definition.status === 'inactive'
      ? [
          {
            code: 'SHAPE_INACTIVE',
            severity: mode === 'create' ? 'error' : 'warning',
            path: ['shape'],
            message: `Shape '${edge.shape}' is inactive`,
            expected: 'active',
            actual: 'inactive',
          },
        ]
      : [];

  const resolved = resolveBindings(graph, definition.properties);
  const propertyErrors = validateProperties(
    edge.properties,
    resolved.definitions,
    definition.closed,
    graph,
  );

  return buildResult(
    stampEntity(
      [
        ...inactiveIssues,
        ...resolved.errors,
        ...propertyErrors,
        ...validateEdgeEndpointShapes(graph, edge, definition),
        ...validateNodeShapeEdgeConstraints(graph, edge),
      ],
      'edge',
      edge.id,
    ),
  );
}
