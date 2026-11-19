import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAllCodegenArtifacts,
  getDefaultTypeSpecSourcePath,
  loadAndParseTypeSpecFromDisk,
  type TypeSpecEnum,
  type TypeSpecField,
  type TypeSpecModel,
  type TypeSpecOperation,
  type TypeSpecServiceIr,
} from './typespec-compiler';

export type CompatibilityProtocol = 'typespec' | 'wit';

export interface Violation {
  readonly protocol: CompatibilityProtocol;
  readonly changeType: string;
  readonly path: string;
  readonly description: string;
  readonly snippet?: string | undefined;
  readonly isDeprecated?: boolean | undefined;
  readonly nonWaivable?: boolean | undefined;
}

export interface Waiver {
  readonly id: string;
  readonly protocol: CompatibilityProtocol | 'all';
  readonly path: string;
  readonly changeType: string;
  readonly reason: string;
  readonly author: string;
  readonly expiresAt: string;
  readonly ticket: string;
}

interface CompatibilityResult {
  readonly success: boolean;
  readonly violations: readonly Violation[];
  readonly approvedWaivers: readonly Waiver[];
  readonly expiredWaivers: readonly Waiver[];
  readonly staleWaivers: readonly Waiver[];
  readonly formattedDiagnostic: string;
}

export interface CheckOptions {
  readonly target?: CompatibilityProtocol | 'all' | undefined;
  readonly currentWit?: string | undefined;
  readonly overrideWit?: string | undefined;
  readonly currentTypeSpecIr?: TypeSpecServiceIr | undefined;
  readonly overrideTypeSpecIr?: TypeSpecServiceIr | undefined;
  readonly baselineTypeSpecIr?: TypeSpecServiceIr | undefined;
  readonly checkCodegenDrift?: boolean | undefined;
  readonly overrideWaivers?: readonly Waiver[] | undefined;
  readonly rootDirectory?: string | undefined;
}

interface ParsedWitBlock {
  readonly name: string;
  readonly body: string;
}

interface ParsedWitFunctions {
  readonly interfaces: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly worlds: ReadonlySet<string>;
}

const checkerDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIRECTORY = path.resolve(checkerDirectory, '../..');

const stripWitComments = (text: string): string =>
  text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');

const scanBalancedBlock = (
  text: string,
  openBraceIndex: number,
  depth = 1,
  cursor = openBraceIndex + 1,
): number => {
  if (cursor >= text.length) return text.length;
  const ch = text[cursor] ?? '';
  if (ch === '{') return scanBalancedBlock(text, openBraceIndex, depth + 1, cursor + 1);
  return ch === '}'
    ? depth <= 1
      ? cursor
      : scanBalancedBlock(text, openBraceIndex, depth - 1, cursor + 1)
    : scanBalancedBlock(text, openBraceIndex, depth, cursor + 1);
};

const extractWitBlocks = (
  source: string,
  keyword: 'interface' | 'world',
): readonly ParsedWitBlock[] => {
  const pattern = new RegExp(String.raw`\b${keyword}\s+([A-Za-z0-9_-]+)\s*\{`, 'g');
  return [...source.matchAll(pattern)].flatMap((match): readonly ParsedWitBlock[] => {
    const name = match[1];
    const matchIndex = match.index;
    if (!name || matchIndex === undefined) return [];
    const openBrace = source.indexOf('{', matchIndex);
    if (openBrace === -1) return [];
    const closeBrace = scanBalancedBlock(source, openBrace);
    return [{ name, body: source.slice(openBrace + 1, closeBrace) }];
  });
};

const parseWitInterfaceFunctions = (body: string): ReadonlyMap<string, string> => {
  const functionPattern = /([A-Za-z0-9_-]+)\s*:\s*func\s*\(([^)]*)\)\s*(->\s*[^;]+)?;/g;
  const pairs = [...body.matchAll(functionPattern)].flatMap(
    (match): readonly (readonly [string, string])[] => {
      const functionName = match[1];
      if (!functionName) return [];
      const normalizedSignature = `func(${(match[2] ?? '').replaceAll(/\s+/g, ' ').trim()})${
        match[3] ? ` ${match[3].replaceAll(/\s+/g, ' ').trim()}` : ''
      }`;
      return [[functionName, normalizedSignature]];
    },
  );
  return new Map(pairs);
};

const parseWitSchema = (rawSchema: string): ParsedWitFunctions => {
  const cleaned = stripWitComments(rawSchema);
  const interfaces = new Map(
    extractWitBlocks(cleaned, 'interface').map(
      (block) => [block.name, parseWitInterfaceFunctions(block.body)] as const,
    ),
  );
  const worlds = new Set(extractWitBlocks(cleaned, 'world').map((block) => block.name));
  return { interfaces, worlds };
};

const checkWit = (liveSchema: string, baselineSchema?: string): readonly Violation[] => {
  if (!baselineSchema || liveSchema.trim().length === 0) return [];
  const baseline = parseWitSchema(baselineSchema);
  const live = parseWitSchema(liveSchema);

  const interfaceViolations: readonly Violation[] = [...baseline.interfaces].flatMap(
    ([interfaceName, baselineFunctions]): readonly Violation[] => {
      const liveFunctions = live.interfaces.get(interfaceName);
      if (!liveFunctions) {
        return [
          {
            protocol: 'wit',
            changeType: 'INTERFACE_REMOVAL',
            path: interfaceName,
            description: `WIT interface '${interfaceName}' was removed`,
          },
        ];
      }

      return [...baselineFunctions].flatMap(
        ([functionName, baselineSignature]): readonly Violation[] => {
          const liveSignature = liveFunctions.get(functionName);
          if (liveSignature === undefined) {
            return [
              {
                protocol: 'wit',
                changeType: 'FUNCTION_REMOVAL',
                path: `${interfaceName}.${functionName}`,
                description: `WIT function '${interfaceName}.${functionName}' was removed`,
                snippet: `-  ${functionName}: ${baselineSignature};\n`,
              },
            ];
          }
          return liveSignature === baselineSignature
            ? []
            : [
                {
                  protocol: 'wit',
                  changeType: 'SIGNATURE_CHANGE',
                  path: `${interfaceName}.${functionName}`,
                  description: `WIT signature changed for '${interfaceName}.${functionName}'`,
                  snippet: `-  ${functionName}: ${baselineSignature};\n+  ${functionName}: ${liveSignature};\n`,
                },
              ];
        },
      );
    },
  );

  const worldViolations: readonly Violation[] = [...baseline.worlds]
    .filter((worldName) => !live.worlds.has(worldName))
    .map((worldName) => ({
      protocol: 'wit',
      changeType: 'WORLD_REMOVAL',
      path: `world.${worldName}`,
      description: `WIT world '${worldName}' was removed`,
    }));

  return [...interfaceViolations, ...worldViolations];
};

const collectResponseModelNames = (ir: TypeSpecServiceIr): ReadonlySet<string> => {
  const modelMap = new Map(ir.models.map((model) => [model.name, model] as const));
  const initialSeeds = ir.namespaces.flatMap((ns) => ns.operations.map((op) => op.responseModel));

  const expand = (queue: readonly string[], visited: ReadonlySet<string>): ReadonlySet<string> => {
    const [head, ...tail] = queue;
    if (!head) return visited;
    if (visited.has(head)) return expand(tail, visited);
    const nextVisited = new Set([...visited, head]);
    const model = modelMap.get(head);
    const referenced = model
      ? model.fields
          .map((field) => field.typeName.replace(/\[\]$/, '').trim())
          .filter((typeName) => modelMap.has(typeName) && !nextVisited.has(typeName))
      : [];
    return expand([...tail, ...referenced], nextVisited);
  };

  return expand(initialSeeds, new Set());
};

const compareOperation = (
  namespaceName: string,
  baselineOp: TypeSpecOperation,
  liveOp: TypeSpecOperation | undefined,
): readonly Violation[] => {
  const opPath = `${namespaceName}.${baselineOp.name}`;
  if (!liveOp) {
    const isDeprecated = baselineOp.deprecated !== undefined;
    return [
      {
        protocol: 'typespec',
        changeType: isDeprecated ? 'OPERATION_REMOVAL' : 'UNDEPRECATED_REMOVAL',
        path: opPath,
        description: isDeprecated
          ? `Deprecated operation '${opPath}' was removed`
          : `Operation '${opPath}' was removed without prior @deprecated annotation`,
        ...(isDeprecated ? { isDeprecated: true } : { nonWaivable: true }),
      },
    ];
  }
  const routeChanged =
    liveOp.method !== baselineOp.method ||
    liveOp.path !== baselineOp.path ||
    liveOp.requestModel !== baselineOp.requestModel ||
    liveOp.responseModel !== baselineOp.responseModel;
  return routeChanged
    ? [
        {
          protocol: 'typespec',
          changeType: 'ROUTE_CHANGE',
          path: opPath,
          description: `Route or signature changed for '${opPath}'`,
          snippet: `- ${baselineOp.method} ${baselineOp.path} (${baselineOp.requestModel}) -> ${baselineOp.responseModel}\n+ ${liveOp.method} ${liveOp.path} (${liveOp.requestModel}) -> ${liveOp.responseModel}\n`,
        },
      ]
    : [];
};

const compareModelFields = (
  modelName: string,
  baselineField: TypeSpecField,
  liveField: TypeSpecField | undefined,
  isResponseModel: boolean,
): readonly Violation[] => {
  const fieldPath = `${modelName}.${baselineField.name}`;
  if (!liveField) {
    const isDeprecated = baselineField.deprecated !== undefined;
    return [
      {
        protocol: 'typespec',
        changeType: isDeprecated ? 'FIELD_REMOVAL' : 'UNDEPRECATED_REMOVAL',
        path: fieldPath,
        description: isDeprecated
          ? `Deprecated field '${fieldPath}' was removed`
          : `Field '${fieldPath}' was removed without prior @deprecated annotation`,
        ...(isDeprecated ? { isDeprecated: true } : { nonWaivable: true }),
      },
    ];
  }

  const typeViolations: readonly Violation[] =
    liveField.typeName === baselineField.typeName
      ? []
      : [
          {
            protocol: 'typespec',
            changeType: 'FIELD_TYPE_CHANGE',
            path: fieldPath,
            description: `Field type changed on '${fieldPath}': ${baselineField.typeName} -> ${liveField.typeName}`,
          },
        ];

  const requiredTightenedViolations: readonly Violation[] =
    baselineField.optional && !liveField.optional
      ? [
          {
            protocol: 'typespec',
            changeType: 'OPTIONAL_TO_REQUIRED',
            path: fieldPath,
            description: `Optional field '${fieldPath}' became required`,
          },
        ]
      : [];

  const responseWeakenedViolations: readonly Violation[] =
    isResponseModel && !baselineField.optional && liveField.optional
      ? [
          {
            protocol: 'typespec',
            changeType: 'REQUIRED_TO_OPTIONAL',
            path: fieldPath,
            description: `Required response field '${fieldPath}' became optional`,
          },
        ]
      : [];

  return [...typeViolations, ...requiredTightenedViolations, ...responseWeakenedViolations];
};

const compareModel = (
  baselineModel: TypeSpecModel,
  liveModel: TypeSpecModel | undefined,
  isResponseModel: boolean,
): readonly Violation[] => {
  if (!liveModel) {
    return [
      {
        protocol: 'typespec',
        changeType: 'MODEL_REMOVAL',
        path: baselineModel.name,
        description: `Model '${baselineModel.name}' was removed`,
      },
    ];
  }
  const liveFieldMap = new Map(liveModel.fields.map((field) => [field.name, field] as const));
  const baselineFieldSet = new Set(baselineModel.fields.map((field) => field.name));

  const existingFieldViolations = baselineModel.fields.flatMap((baselineField) =>
    compareModelFields(
      baselineModel.name,
      baselineField,
      liveFieldMap.get(baselineField.name),
      isResponseModel,
    ),
  );

  const addedRequiredFieldViolations: readonly Violation[] = liveModel.fields
    .filter((liveField) => !baselineFieldSet.has(liveField.name) && !liveField.optional)
    .map((liveField) => ({
      protocol: 'typespec',
      changeType: 'OPTIONAL_TO_REQUIRED',
      path: `${baselineModel.name}.${liveField.name}`,
      description: `Added new required field '${baselineModel.name}.${liveField.name}'`,
    }));

  return [...existingFieldViolations, ...addedRequiredFieldViolations];
};

const compareEnum = (
  baselineEnum: TypeSpecEnum,
  liveEnum: TypeSpecEnum | undefined,
): readonly Violation[] => {
  if (!liveEnum) {
    return [
      {
        protocol: 'typespec',
        changeType: 'MODEL_REMOVAL',
        path: baselineEnum.name,
        description: `Enum '${baselineEnum.name}' was removed`,
      },
    ];
  }
  const liveMembers = new Set(liveEnum.members.map((member) => member.name));
  const baselineMembers = new Set(baselineEnum.members.map((member) => member.name));

  const removedVariants: readonly Violation[] = baselineEnum.members
    .filter((member) => !liveMembers.has(member.name))
    .map((member) => ({
      protocol: 'typespec',
      changeType: 'ENUM_VARIANT_REMOVAL',
      path: `${baselineEnum.name}.${member.name}`,
      description: `Enum variant '${baselineEnum.name}.${member.name}' was removed`,
    }));

  const addedClosedVariants: readonly Violation[] = liveEnum.extensible
    ? []
    : liveEnum.members
        .filter((member) => !baselineMembers.has(member.name))
        .map((member) => ({
          protocol: 'typespec',
          changeType: 'ENUM_VARIANT_ADDED',
          path: `${baselineEnum.name}.${member.name}`,
          description: `Enum variant '${baselineEnum.name}.${member.name}' was added to closed enum '${baselineEnum.name}'`,
        }));

  return [...removedVariants, ...addedClosedVariants];
};

export const checkTypeSpec = (
  liveIr: TypeSpecServiceIr,
  baselineIr: TypeSpecServiceIr | undefined,
): readonly Violation[] => {
  if (!baselineIr) return [];

  const liveNamespaces = new Map(liveIr.namespaces.map((ns) => [ns.name, ns] as const));
  const liveModels = new Map(liveIr.models.map((model) => [model.name, model] as const));
  const liveEnums = new Map(liveIr.enums.map((entry) => [entry.name, entry] as const));
  const responseModels = collectResponseModelNames(baselineIr);

  const namespaceViolations = baselineIr.namespaces.flatMap((baselineNs): readonly Violation[] => {
    const liveNs = liveNamespaces.get(baselineNs.name);
    if (!liveNs) {
      return [
        {
          protocol: 'typespec',
          changeType: 'NAMESPACE_REMOVAL',
          path: baselineNs.name,
          description: `TypeSpec namespace '${baselineNs.name}' was removed`,
        },
      ];
    }
    const liveOps = new Map(liveNs.operations.map((op) => [op.name, op] as const));
    return baselineNs.operations.flatMap((baselineOp) =>
      compareOperation(baselineNs.name, baselineOp, liveOps.get(baselineOp.name)),
    );
  });

  const modelViolations = baselineIr.models.flatMap((baselineModel) =>
    compareModel(
      baselineModel,
      liveModels.get(baselineModel.name),
      responseModels.has(baselineModel.name),
    ),
  );

  const enumViolations = baselineIr.enums.flatMap((baselineEnum) =>
    compareEnum(baselineEnum, liveEnums.get(baselineEnum.name)),
  );

  return [...namespaceViolations, ...modelViolations, ...enumViolations];
};

const checkCodegenDrift = (
  liveIr: TypeSpecServiceIr,
  rootDirectory: string,
): readonly Violation[] => {
  const expected = generateAllCodegenArtifacts(liveIr);
  const pairs: readonly (readonly [string, string])[] = [
    ['packages/graph-access/src/canopy-v0-contract.ts', expected.contractTs],
    ['packages/plugin-host/src/wasm/wit-spec.ts', expected.witSpecTs],
    ['packages/plugin-host/schema-baselines/plugin.wit', expected.witBaselineText],
    [
      'packages/plugin-host/schema-baselines/canopy-v0-typespec.json',
      expected.typespecBaselineJson,
    ],
  ];

  return pairs.flatMap(([relativePath, expectedContent]): readonly Violation[] => {
    const fullPath = path.join(rootDirectory, relativePath);
    if (!fs.existsSync(fullPath)) {
      return [
        {
          protocol: 'typespec',
          changeType: 'CODEGEN_DRIFT',
          path: relativePath,
          description: `Generated artifact '${relativePath}' is missing; run bun tools/typespec-codegen.ts`,
        },
      ];
    }
    const actualContent = fs.readFileSync(fullPath, 'utf8');
    return actualContent === expectedContent
      ? []
      : [
          {
            protocol: 'typespec',
            changeType: 'CODEGEN_DRIFT',
            path: relativePath,
            description: `Generated artifact '${relativePath}' drifted from TypeSpec source; run bun tools/typespec-codegen.ts`,
          },
        ];
  });
};

const waiverMatchesViolation = (waiver: Waiver, violation: Violation): boolean =>
  violation.nonWaivable !== true &&
  waiver.path === violation.path &&
  waiver.changeType === violation.changeType &&
  (waiver.protocol === violation.protocol || waiver.protocol === 'all');

const loadBaselineTypeSpecIr = (baselinesDirectory: string): TypeSpecServiceIr | undefined => {
  const baselinePath = path.join(baselinesDirectory, 'canopy-v0-typespec.json');
  return fs.existsSync(baselinePath)
    ? (JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as TypeSpecServiceIr)
    : undefined;
};

const formatCompatibilityDiagnostic = (violations: readonly Violation[]): string =>
  `API Compatibility Checks Failed\n\n${violations
    .map(
      (v, index) =>
        `--- Violation ${index + 1} ---\nProtocol: ${v.protocol.toUpperCase()}\nType: ${v.changeType}\nSymbol: ${v.path}\nDescription: ${v.description}\n${v.snippet ? `\nDiff:\n${v.snippet}\n` : ''}\n`,
    )
    .join('')}--- Remediation ---\nTo approve waivable changes, add waivers:\n${violations
    .filter((v) => v.nonWaivable !== true)
    .map(
      (v) =>
        `bun tools/check-api-compatibility.ts --add-waiver --protocol ${v.protocol} --path ${v.path} --change-type ${v.changeType} --reason "Explain why"\n`,
    )
    .join('')}\nTo update baselines (only when changes are approved):\n${[
    ...new Set(violations.map((v) => v.protocol)),
  ]
    .map(
      (protocol) =>
        `bun tools/check-api-compatibility.ts --update-baselines --target ${protocol}\n`,
    )
    .join('')}`;

export const checkApiCompatibility = (options?: CheckOptions): CompatibilityResult => {
  const rootDirectory = options?.rootDirectory ?? DEFAULT_ROOT_DIRECTORY;
  const baselinesDirectory = path.join(rootDirectory, 'packages/plugin-host/schema-baselines');
  const waivers = options?.overrideWaivers ?? [];
  const target = options?.target ?? 'all';
  const now = Temporal.Now.plainDateISO().toString();

  const shouldCheckWit = target === 'all' || target === 'wit';
  const shouldCheckTypeSpec = target === 'all' || target === 'typespec';

  const witLive = options?.overrideWit ?? options?.currentWit ?? '';
  const witBaselinePath = path.join(baselinesDirectory, 'plugin.wit');
  const witBaseline =
    shouldCheckWit && fs.existsSync(witBaselinePath)
      ? fs.readFileSync(witBaselinePath, 'utf8')
      : undefined;
  const witViolations = shouldCheckWit ? checkWit(witLive, witBaseline) : [];

  const resolvedLiveTypeSpecIr = (() => {
    if (!shouldCheckTypeSpec) return undefined;
    if (options?.overrideTypeSpecIr) return options.overrideTypeSpecIr;
    if (options?.currentTypeSpecIr) return options.currentTypeSpecIr;
    const defaultSource = getDefaultTypeSpecSourcePath(rootDirectory);
    if (!fs.existsSync(defaultSource)) return undefined;
    const parsed = loadAndParseTypeSpecFromDisk(defaultSource);
    return parsed.ok ? parsed.value : undefined;
  })();

  const baselineTypeSpecIr = shouldCheckTypeSpec
    ? (options?.baselineTypeSpecIr ?? loadBaselineTypeSpecIr(baselinesDirectory))
    : undefined;

  const typeSpecViolations =
    shouldCheckTypeSpec && resolvedLiveTypeSpecIr
      ? checkTypeSpec(resolvedLiveTypeSpecIr, baselineTypeSpecIr)
      : [];
  const shouldCheckDrift = Boolean(options?.checkCodegenDrift);
  const driftViolations =
    shouldCheckTypeSpec && shouldCheckDrift && resolvedLiveTypeSpecIr
      ? checkCodegenDrift(resolvedLiveTypeSpecIr, rootDirectory)
      : [];

  const violations = [...witViolations, ...typeSpecViolations, ...driftViolations];
  const expiredWaivers = waivers.filter((waiver) => waiver.expiresAt < now);
  const activeWaivers = waivers.filter((waiver) => !expiredWaivers.includes(waiver));

  const unhandledViolations = violations.filter((violation) =>
    activeWaivers.every((waiver) => !waiverMatchesViolation(waiver, violation)),
  );
  const approvedWaivers = activeWaivers.filter((waiver) =>
    violations.some((violation) => waiverMatchesViolation(waiver, violation)),
  );
  const staleWaivers = activeWaivers.filter((waiver) =>
    violations.every((violation) => !waiverMatchesViolation(waiver, violation)),
  );

  const success =
    unhandledViolations.length === 0 && expiredWaivers.length === 0 && staleWaivers.length === 0;
  const formattedDiagnostic = success
    ? 'All compatibility checks passed.'
    : formatCompatibilityDiagnostic(unhandledViolations);

  return {
    success,
    violations: unhandledViolations,
    approvedWaivers,
    expiredWaivers,
    staleWaivers,
    formattedDiagnostic,
  };
};
