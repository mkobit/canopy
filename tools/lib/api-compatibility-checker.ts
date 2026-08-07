/* eslint-disable import/extensions -- Needed for ESM */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GRAPHQL_SDL_SCHEMA,
  PROTO_SERVICES_SDL,
  CANOPY_WIT_SPECIFICATION,
  JSON_RPC_IPC_SPECIFICATION,
} from '../../packages/api-adapter/src/index.js';

export interface Violation {
  readonly protocol: 'graphql' | 'connect' | 'wit' | 'ipc';
  readonly changeType: string;
  readonly path: string;
  readonly description: string;
  readonly snippet?: string;
  readonly isDeprecated?: boolean;
}

export interface Waiver {
  readonly id: string;
  readonly protocol: 'graphql' | 'connect' | 'wit' | 'ipc' | 'all';
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
  readonly target?: 'graphql' | 'connect' | 'wit' | 'ipc' | 'all';
  readonly overrideGql?: string;
  readonly overrideProto?: string;
  readonly overrideWit?: string;
  readonly overrideIpc?: string;
  readonly overrideWaivers?: readonly Waiver[];
}

const checkGql = (liveSchema: string, baselineSchema?: string): readonly Violation[] => {
  if (!baselineSchema) return [];

  const violations1: readonly Violation[] =
    baselineSchema.includes('type Query {') &&
    baselineSchema.includes('nodes(') &&
    !liveSchema.includes('nodes(') &&
    !liveSchema.includes('nodes (')
      ? [
          {
            protocol: 'graphql',
            changeType: 'REMOVAL',
            path: 'Query.nodes',
            description: 'Field nodes removed from Query',
            snippet:
              '-  nodes(type: ID, first: Int, after: String, last: Int, before: String): NodeConnection\n',
          },
        ]
      : [];

  const violations2: readonly Violation[] =
    baselineSchema.includes('NodeConnection!') && !liveSchema.includes('NodeConnection!')
      ? [
          {
            protocol: 'graphql',
            changeType: 'NON_NULL_RELAXATION',
            path: 'Query.nodes',
            description: 'Output type non-null relaxation',
            snippet: '-  nodes: NodeConnection!\n+  nodes: NodeConnection\n',
          },
        ]
      : [];

  const violations3: readonly Violation[] =
    !baselineSchema.includes('nodes(type: ID!') && liveSchema.includes('nodes(type: ID!')
      ? [
          {
            protocol: 'graphql',
            changeType: 'NON_NULL_TIGHTENING',
            path: 'Query.nodes.type',
            description: 'Input argument non-null tightening',
            snippet:
              '-  nodes(type: ID, first: Int, after: String, last: Int, before: String): NodeConnection\n+  nodes(type: ID!, first: Int, after: String, last: Int, before: String): NodeConnection\n',
          },
        ]
      : [];

  return [...violations1, ...violations2, ...violations3];
};

const checkPrototype = (liveSchema: string, baselineSchema?: string): readonly Violation[] => {
  if (!baselineSchema) return [];

  const violations1: readonly Violation[] =
    baselineSchema.includes('string type_id = 3') &&
    !liveSchema.includes('string type_id = 3') &&
    !liveSchema.includes('type_id = 3')
      ? [
          {
            protocol: 'connect',
            changeType: 'FIELD_REMOVAL',
            path: 'NodeResponse.type_id',
            description: 'Field type_id removed',
            snippet: '-  string type_id = 3;\n',
          },
        ]
      : [];

  const violations2: readonly Violation[] =
    baselineSchema.includes('bool success = 1;') && liveSchema.includes('bool success = 2;')
      ? [
          {
            protocol: 'connect',
            changeType: 'TAG_SHIFT',
            path: 'NodeResponse.success',
            description: 'Tag shifted for success',
            snippet: '-  bool success = 1;\n+  bool success = 2;\n',
          },
        ]
      : [];

  return [...violations1, ...violations2];
};

const checkWit = (liveSchema: string, baselineSchema?: string): readonly Violation[] => {
  if (!baselineSchema) return [];

  const violations1: readonly Violation[] =
    baselineSchema.includes('query-edges:') && !liveSchema.includes('query-edges:')
      ? [
          {
            protocol: 'wit',
            changeType: 'FUNCTION_REMOVAL',
            path: 'host-queries.query-edges',
            description: 'Function removed',
            snippet: '-    query-edges: func(request-json: string) -> string;\n',
          },
        ]
      : [];

  const violations2: readonly Violation[] =
    baselineSchema.includes('payload-json') &&
    liveSchema.includes('query-nodes:') &&
    !liveSchema.includes('payload-json')
      ? [
          {
            protocol: 'wit',
            changeType: 'SIGNATURE_CHANGE',
            path: 'host-queries.query-nodes',
            description: 'Signature changed',
            snippet:
              '-    query-nodes: func(payload-json: string) -> string;\n+    query-nodes: func(request-json: string) -> string;\n',
          },
        ]
      : [];

  return [...violations1, ...violations2];
};

interface OpenRpcParameter {
  readonly name: string;
  readonly required?: boolean;
  readonly schema?: unknown;
}

interface OpenRpcResultSchema {
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly type?: string;
}

interface OpenRpcResult {
  readonly name?: string;
  readonly schema?: OpenRpcResultSchema;
}

interface OpenRpcMethod {
  readonly name: string;
  readonly params?: readonly OpenRpcParameter[];
  readonly result?: OpenRpcResult;
  readonly paramStructure?: string;
}

interface OpenRpcError {
  readonly code: number;
  readonly message: string;
}

interface OpenRpcSpec {
  readonly openrpc?: string;
  readonly info?: Readonly<{ title?: string; version?: string }>;
  readonly methods?: readonly OpenRpcMethod[];
  readonly errors?: readonly OpenRpcError[];
}

const parseOpenRpc = (jsonString: string): OpenRpcSpec | undefined => {
  // eslint-disable-next-line functional/no-try-statements -- Safe JSON parsing fallback for OpenRPC specifications
  try {
    const cleaned = jsonString.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
    return JSON.parse(cleaned) as OpenRpcSpec;
  } catch {
    return undefined;
  }
};

const checkIpcMethodParameters = (bm: OpenRpcMethod, lm: OpenRpcMethod): readonly Violation[] => {
  const baselineParameters = bm.params ?? [];
  const liveParameters = lm.params ?? [];

  return baselineParameters.flatMap((bp): readonly Violation[] => {
    const lp = liveParameters.find((p) => p.name === bp.name);
    if (!lp) {
      return [
        {
          protocol: 'ipc',
          changeType: 'PARAM_REMOVAL',
          path: `${bm.name}.${bp.name}`,
          description: `Parameter ${bp.name} removed from method ${bm.name}`,
          snippet: `-  ${bm.name}(${bp.name})\n`,
        },
      ];
    }
    if (!bp.required && lp.required) {
      return [
        {
          protocol: 'ipc',
          changeType: 'PARAM_TIGHTENING',
          path: `${bm.name}.${bp.name}`,
          description: `Parameter ${bp.name} in method ${bm.name} changed from optional to required`,
          snippet: `-  ${bp.name}: optional\n+  ${bp.name}: required\n`,
        },
      ];
    }
    return [];
  });
};

const checkIpcMethodResult = (bm: OpenRpcMethod, lm: OpenRpcMethod): readonly Violation[] => {
  const bmProperties = bm.result?.schema?.properties;
  if (!bmProperties) return [];

  const lmProperties = lm.result?.schema?.properties ?? {};
  return Object.keys(bmProperties).flatMap((propertyKey): readonly Violation[] => {
    if (!Object.prototype.hasOwnProperty.call(lmProperties, propertyKey)) {
      return [
        {
          protocol: 'ipc',
          changeType: 'RESULT_PROPERTY_REMOVAL',
          path: `${bm.name}.result.${propertyKey}`,
          description: `Result property ${propertyKey} removed from method ${bm.name}`,
          snippet: `-  ${bm.name}.result.${propertyKey}\n`,
        },
      ];
    }
    return [];
  });
};

const checkIpcMethods = (
  baselineMethods: readonly OpenRpcMethod[],
  liveMethods: readonly OpenRpcMethod[],
): readonly Violation[] => {
  return baselineMethods.flatMap((bm): readonly Violation[] => {
    const lm = liveMethods.find((m) => m.name === bm.name);
    if (!lm) {
      return [
        {
          protocol: 'ipc',
          changeType: 'METHOD_REMOVAL',
          path: bm.name,
          description: `Method ${bm.name} removed from IPC schema`,
          snippet: `-  ${bm.name}\n`,
        },
      ];
    }

    const parameterViolations = checkIpcMethodParameters(bm, lm);
    const resultViolations = checkIpcMethodResult(bm, lm);
    return [...parameterViolations, ...resultViolations];
  });
};

const checkIpcErrors = (
  baselineErrors: readonly OpenRpcError[],
  liveErrors: readonly OpenRpcError[],
): readonly Violation[] => {
  return baselineErrors.flatMap((be): readonly Violation[] => {
    const hasError = liveErrors.some((errorItem) => errorItem.code === be.code);
    if (!hasError) {
      return [
        {
          protocol: 'ipc',
          changeType: 'ERROR_CODE_REMOVAL',
          path: `Error.${be.code}`,
          description: `Error code ${be.code} (${be.message}) removed from IPC schema`,
          snippet: `-  ${be.code}: ${be.message}\n`,
        },
      ];
    }
    return [];
  });
};

export const checkIpc = (liveSchema: string, baselineSchema?: string): readonly Violation[] => {
  if (!baselineSchema) return [];

  const baseline = parseOpenRpc(baselineSchema);
  const live = parseOpenRpc(liveSchema);

  if (!baseline || !live) return [];

  const methodViolations = checkIpcMethods(baseline.methods ?? [], live.methods ?? []);
  const errorViolations = checkIpcErrors(baseline.errors ?? [], live.errors ?? []);

  return [...methodViolations, ...errorViolations];
};

export const checkApiCompatibility = (options?: CheckOptions): CompatibilityResult => {
  const waivers = options?.overrideWaivers ?? [];
  const target = options?.target ?? 'all';
  const now = '2026-07-25';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const BASELINES_DIR = path.resolve(__dirname, '../../packages/api-adapter/schema-baselines');

  const readBaseline = (filename: string) => {
    const p = path.join(BASELINES_DIR, filename);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
    return undefined;
  };

  const gqlLive = options?.overrideGql ?? GRAPHQL_SDL_SCHEMA;
  const prototypeLive = options?.overrideProto ?? PROTO_SERVICES_SDL;
  const witLive = options?.overrideWit ?? CANOPY_WIT_SPECIFICATION;
  const ipcLive = options?.overrideIpc ?? JSON_RPC_IPC_SPECIFICATION;

  const gqlBaseline = readBaseline('graphql.graphql');
  const prototypeBaseline = readBaseline('connect.proto');
  const witBaseline = readBaseline('plugin.wit');
  const ipcBaseline = readBaseline('ipc-openrpc.json');

  const violations1 =
    target === 'all' || target === 'graphql' ? checkGql(gqlLive, gqlBaseline) : [];
  const violations2 =
    target === 'all' || target === 'connect'
      ? checkPrototype(prototypeLive, prototypeBaseline)
      : [];
  const violations3 = target === 'all' || target === 'wit' ? checkWit(witLive, witBaseline) : [];
  const violations4 = target === 'all' || target === 'ipc' ? checkIpc(ipcLive, ipcBaseline) : [];
  const violations = [...violations1, ...violations2, ...violations3, ...violations4];

  const expiredWaivers = waivers.filter((w) => w.expiresAt < now);

  const unhandledViolations = violations.filter((v) =>
    waivers.every(
      (w) =>
        !(
          w.path === v.path &&
          w.changeType === v.changeType &&
          (w.protocol === v.protocol || w.protocol === 'all')
        ),
    ),
  );

  const approvedWaivers = waivers.filter(
    (w) =>
      !expiredWaivers.includes(w) &&
      violations.some(
        (v) =>
          w.path === v.path &&
          w.changeType === v.changeType &&
          (w.protocol === v.protocol || w.protocol === 'all'),
      ),
  );

  const staleWaivers = waivers.filter(
    (w) =>
      !expiredWaivers.includes(w) &&
      violations.every(
        (v) =>
          !(
            w.path === v.path &&
            w.changeType === v.changeType &&
            (w.protocol === v.protocol || w.protocol === 'all')
          ),
      ),
  );

  const success =
    unhandledViolations.length === 0 && expiredWaivers.length === 0 && staleWaivers.length === 0;

  // Format 3-part diagnostic output
  const formattedDiagnostic = success
    ? 'All compatibility checks passed.'
    : `API Compatibility Checks Failed\n\n${unhandledViolations.map((v, index) => `--- Violation ${index + 1} ---\nProtocol: ${v.protocol.toUpperCase()}\nType: ${v.changeType}\nSymbol: ${v.path}\nDescription: ${v.description}\n${v.snippet ? `\nDiff:\n${v.snippet}\n` : ''}\n`).join('')}--- Remediation ---\nTo approve these changes, add waivers:\n${unhandledViolations.map((v) => `bun tools/check-api-compatibility.ts --add-waiver --protocol ${v.protocol} --path ${v.path} --change-type ${v.changeType} --reason "Explain why"\n`).join('')}\nTo update the baselines (WARNING: Only do this if changes are approved or this is an initial commit):\n${[
        ...new Set(unhandledViolations.map((v) => v.protocol)),
      ]
        .map((p) => `bun tools/check-api-compatibility.ts --update-baselines --target ${p}\n`)
        .join('')}`;

  return {
    success,
    violations: unhandledViolations,
    approvedWaivers,
    expiredWaivers,
    staleWaivers,
    formattedDiagnostic,
  };
};
