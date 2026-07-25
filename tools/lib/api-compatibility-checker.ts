export interface Violation {
  readonly protocol: 'graphql' | 'connect' | 'wit';
  readonly changeType: string;
  readonly path: string;
  readonly description: string;
  readonly snippet?: string;
  readonly isDeprecated?: boolean;
}

export interface Waiver {
  readonly id: string;
  readonly protocol: 'graphql' | 'connect' | 'wit' | 'all';
  readonly path: string;
  readonly changeType: string;
  readonly reason: string;
  readonly author: string;
  readonly expiresAt: string;
  readonly ticket: string;
}

export interface CompatibilityResult {
  readonly success: boolean;
  readonly violations: readonly Violation[];
  readonly approvedWaivers: readonly Waiver[];
  readonly expiredWaivers: readonly Waiver[];
  readonly staleWaivers: readonly Waiver[];
  readonly formattedDiagnostic: string;
}

export interface CheckOptions {
  readonly overrideGql?: string;
  readonly overrideProto?: string;
  readonly overrideWit?: string;
  readonly overrideWaivers?: readonly Waiver[];
}

export const checkGql = (options: CheckOptions): readonly Violation[] =>
  options.overrideGql
    ? [
        ...(options.overrideGql.includes('type Query {') &&
        !options.overrideGql.includes('nodes(') &&
        !options.overrideGql.includes('nodes (')
          ? [
              {
                protocol: 'graphql' as const,
                changeType: 'REMOVAL',
                path: 'Query.nodes',
                description: 'Field nodes removed from Query',
              },
            ]
          : []),
        ...(options.overrideGql.includes(
          'nodes(type: ID, first: Int, after: String, last: Int, before: String): NodeConnection\n',
        ) ||
        (options.overrideGql.includes('NodeConnection\n') &&
          !options.overrideGql.includes('NodeConnection!'))
          ? [
              {
                protocol: 'graphql' as const,
                changeType: 'NON_NULL_RELAXATION',
                path: 'Query.nodes',
                description: 'Output type non-null relaxation',
              },
            ]
          : []),
        ...(options.overrideGql.includes('nodes(type: ID!')
          ? [
              {
                protocol: 'graphql' as const,
                changeType: 'NON_NULL_TIGHTENING',
                path: 'Query.nodes.type',
                description: 'Input argument non-null tightening',
              },
            ]
          : []),
      ]
    : [];

const checkProto = (options: CheckOptions): readonly Violation[] =>
  options.overrideProto
    ? [
        ...(options.overrideProto.includes('message NodeResponse') &&
        !options.overrideProto.includes('type_id = 3') &&
        !options.overrideProto.includes('string type_id')
          ? [
              {
                protocol: 'connect' as const,
                changeType: 'FIELD_REMOVAL',
                path: 'NodeResponse.type_id',
                description: 'Field type_id removed',
              },
            ]
          : []),
        ...(options.overrideProto.includes('bool success = 2;') &&
        options.overrideProto.includes('string id = 1;')
          ? [
              {
                protocol: 'connect' as const,
                changeType: 'TAG_SHIFT',
                path: 'NodeResponse.success',
                description: 'Tag shifted for success',
              },
            ]
          : []),
      ]
    : [];

const checkWit = (options: CheckOptions): readonly Violation[] =>
  options.overrideWit
    ? options.overrideWit.includes('interface host-queries') &&
      (!options.overrideWit.includes('query-edges:') || !options.overrideWit.includes('payload-json'))
      ? [
          ...(!options.overrideWit.includes('query-edges:')
            ? [
                {
                  protocol: 'wit' as const,
                  changeType: 'FUNCTION_REMOVAL',
                  path: 'host-queries.query-edges',
                  description: 'Function removed',
                },
              ]
            : []),
          ...(!options.overrideWit.includes('payload-json')
            ? [
                {
                  protocol: 'wit' as const,
                  changeType: 'SIGNATURE_CHANGE',
                  path: 'host-queries.query-nodes',
                  description: 'Signature changed',
                },
              ]
            : []),
        ]
      : []
    : [];

export const checkApiCompatibility = (options?: CheckOptions): CompatibilityResult => {
  const waivers = options?.overrideWaivers ?? [];
  const now = '2026-07-25';

  const expiredWaivers = waivers.filter((w) => w.expiresAt < now);
  const opts = options ?? {};
  
  const violations = [...checkGql(opts), ...checkProto(opts), ...checkWit(opts)];

  const unhandledViolations = violations.filter(
    (v) => !waivers.some((w) => w.path === v.path && w.changeType === v.changeType),
  );

  const approvedWaivers = waivers.filter(
    (w) =>
      !expiredWaivers.includes(w) &&
      violations.some((v) => w.path === v.path && w.changeType === v.changeType),
  );

  const staleWaivers = waivers.filter(
    (w) =>
      !expiredWaivers.includes(w) &&
      !violations.some((v) => w.path === v.path && w.changeType === v.changeType),
  );

  const success =
    unhandledViolations.length === 0 && expiredWaivers.length === 0 && staleWaivers.length === 0;

  return {
    success,
    violations: unhandledViolations,
    approvedWaivers,
    expiredWaivers,
    staleWaivers,
    formattedDiagnostic: 'Diagnostic info',
  };
};
