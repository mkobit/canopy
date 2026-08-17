import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Derives the real internal @canopy/* dependency graph from every workspace
// package.json and enforces three properties: the kernel is a dependency
// leaf, the graph (including devDependencies) is acyclic, and the mermaid
// diagram in docs/architecture/bounded-contexts.md matches the real runtime
// edges. See openspec/changes/dependency-graph-guard/design.md.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, '..');
const boundedContextsPath = path.join(rootDirectory, 'docs/architecture/bounded-contexts.md');

const CANOPY_PREFIX = '@canopy/';
const KERNEL_PACKAGE = '@canopy/graph';

interface WorkspaceManifest {
  readonly name: string;
  readonly workspaceDir: string;
  readonly runtimeDeps: readonly string[];
  readonly devDeps: readonly string[];
}

interface Edge {
  readonly from: string;
  readonly to: string;
}

interface Violation {
  readonly kind: 'leaf' | 'cycle' | 'doc-parity';
  readonly message: string;
}

interface PackageJsonShape {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

function listWorkspaceManifestPaths(root: string): readonly string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--', 'packages/*/package.json', 'apps/*/package.json'],
    { cwd: root, encoding: 'utf8' },
  );
  return output.split('\0').filter((entry) => entry.length > 0);
}

function canopyDependencyNames(
  dependencies: Readonly<Record<string, string>> | undefined,
): readonly string[] {
  return Object.keys(dependencies ?? {}).filter((name) => name.startsWith(CANOPY_PREFIX));
}

function readManifest(root: string, relativePath: string): WorkspaceManifest {
  const package_ = JSON.parse(
    readFileSync(path.join(root, relativePath), 'utf8'),
  ) as PackageJsonShape;
  return {
    name: package_.name ?? relativePath,
    workspaceDir: path.dirname(relativePath),
    runtimeDeps: canopyDependencyNames(package_.dependencies),
    devDeps: canopyDependencyNames(package_.devDependencies),
  };
}

export function readWorkspaces(root: string): readonly WorkspaceManifest[] {
  return listWorkspaceManifestPaths(root).map((relativePath) => readManifest(root, relativePath));
}

export function deriveRuntimeEdges(workspaces: readonly WorkspaceManifest[]): readonly Edge[] {
  return workspaces.flatMap((workspace) =>
    workspace.runtimeDeps.map((to) => ({ from: workspace.name, to })),
  );
}

export function deriveAllEdges(workspaces: readonly WorkspaceManifest[]): readonly Edge[] {
  return workspaces.flatMap((workspace) =>
    [...workspace.runtimeDeps, ...workspace.devDeps].map((to) => ({ from: workspace.name, to })),
  );
}

export function checkLeaf(workspaces: readonly WorkspaceManifest[]): readonly Violation[] {
  const kernel = workspaces.find((workspace) => workspace.name === KERNEL_PACKAGE);
  if (kernel === undefined) {
    return [
      { kind: 'leaf', message: `${KERNEL_PACKAGE} workspace manifest not found under packages/` },
    ];
  }
  const runtimeViolations = kernel.runtimeDeps.map((dependency) => ({
    kind: 'leaf' as const,
    message: `${KERNEL_PACKAGE} declares a runtime dependency on internal package "${dependency}"; the kernel must have zero @canopy/* dependencies (AGENTS.md invariant #1)`,
  }));
  const developmentViolations = kernel.devDeps.map((dependency) => ({
    kind: 'leaf' as const,
    message: `${KERNEL_PACKAGE} declares a devDependency on internal package "${dependency}"; the kernel must have zero @canopy/* devDependencies (AGENTS.md invariant #1)`,
  }));
  return [...runtimeViolations, ...developmentViolations];
}

function neighborsOf(edges: readonly Edge[], node: string): readonly string[] {
  return edges.filter((edge) => edge.from === node).map((edge) => edge.to);
}

function findCycleFrom(edges: readonly Edge[], start: string): readonly string[] | undefined {
  function visit(node: string, pathSoFar: readonly string[]): readonly string[] | undefined {
    const cycleStart = pathSoFar.indexOf(node);
    if (cycleStart !== -1) {
      return [...pathSoFar.slice(cycleStart), node];
    }
    const nextPath = [...pathSoFar, node];
    return neighborsOf(edges, node)
      .map((neighbor) => visit(neighbor, nextPath))
      .find((result): result is readonly string[] => result !== undefined);
  }
  return visit(start, []);
}

function findAnyCycle(
  nodeNames: readonly string[],
  edges: readonly Edge[],
): readonly string[] | undefined {
  return nodeNames
    .map((node) => findCycleFrom(edges, node))
    .find((result): result is readonly string[] => result !== undefined);
}

export function checkCycle(
  nodeNames: readonly string[],
  edges: readonly Edge[],
): readonly Violation[] {
  const cycle = findAnyCycle(nodeNames, edges);
  return cycle === undefined
    ? []
    : [{ kind: 'cycle', message: `Dependency cycle detected: ${cycle.join(' -> ')}` }];
}

const DEPENDENCY_GRAPH_HEADING = '## Dependency graph';
const MERMAID_FENCE_OPEN = '```mermaid';
const MERMAID_FENCE_CLOSE = '```';
const NODE_DECL_PATTERN = /^\s*(\w+)\[([^\]]+)]\s*$/;
const EDGE_PATTERN = /^\s*(\w+)\s*-->\s*(\w+)\s*$/;
const GRAPH_HEADER_PATTERN = /^\s*graph\s+\w+\s*$/;
const COMMENT_PATTERN = /^\s*%%/;
const BLANK_PATTERN = /^\s*$/;

export function extractMermaidBlock(markdown: string): readonly string[] | undefined {
  const headingIndex = markdown.indexOf(DEPENDENCY_GRAPH_HEADING);
  if (headingIndex === -1) return undefined;
  const afterHeading = markdown.slice(headingIndex);
  const fenceOpenIndex = afterHeading.indexOf(MERMAID_FENCE_OPEN);
  if (fenceOpenIndex === -1) return undefined;
  const afterFenceOpen = afterHeading.slice(fenceOpenIndex + MERMAID_FENCE_OPEN.length);
  const fenceCloseIndex = afterFenceOpen.indexOf(MERMAID_FENCE_CLOSE);
  if (fenceCloseIndex === -1) return undefined;
  return afterFenceOpen.slice(0, fenceCloseIndex).split('\n');
}

interface MermaidNode {
  readonly id: string;
  readonly label: string;
}

interface MermaidEdgeReference {
  readonly from: string;
  readonly to: string;
}

interface MermaidGraph {
  readonly nodes: ReadonlyMap<string, string>;
  readonly edges: readonly MermaidEdgeReference[];
}

function matchNode(line: string): MermaidNode | undefined {
  const match = NODE_DECL_PATTERN.exec(line);
  return match && match[1] !== undefined && match[2] !== undefined
    ? { id: match[1], label: match[2] }
    : undefined;
}

function matchEdge(line: string): MermaidEdgeReference | undefined {
  const match = EDGE_PATTERN.exec(line);
  return match && match[1] !== undefined && match[2] !== undefined
    ? { from: match[1], to: match[2] }
    : undefined;
}

function isIgnorableLine(line: string): boolean {
  return BLANK_PATTERN.test(line) || COMMENT_PATTERN.test(line) || GRAPH_HEADER_PATTERN.test(line);
}

export function parseMermaidGraph(lines: readonly string[]): MermaidGraph | undefined {
  const unrecognized = lines.find(
    (line) =>
      !isIgnorableLine(line) && matchNode(line) === undefined && matchEdge(line) === undefined,
  );
  if (unrecognized !== undefined) return undefined;

  const nodes = new Map(
    lines
      .map(matchNode)
      .filter((node): node is MermaidNode => node !== undefined)
      .map((node) => [node.id, node.label] as const),
  );
  const edges = lines
    .map(matchEdge)
    .filter((edge): edge is MermaidEdgeReference => edge !== undefined);
  return { nodes, edges };
}

interface ResolvedMermaidGraph {
  readonly documentedEdges: readonly Edge[];
  readonly documentedNodeNames: readonly string[];
  readonly unresolvedLabels: readonly string[];
}

function resolveWorkspaceByLabel(
  workspaces: readonly WorkspaceManifest[],
  label: string,
): WorkspaceManifest | undefined {
  return workspaces.find(
    (workspace) => workspace.name === label || workspace.workspaceDir === label,
  );
}

export function resolveMermaidGraph(
  graph: MermaidGraph,
  workspaces: readonly WorkspaceManifest[],
): ResolvedMermaidGraph {
  const idToWorkspace = new Map(
    [...graph.nodes].map(
      ([id, label]) => [id, resolveWorkspaceByLabel(workspaces, label)] as const,
    ),
  );

  const unresolvedLabels = [...graph.nodes]
    .filter(([id]) => idToWorkspace.get(id) === undefined)
    .map(([, label]) => label);

  const documentedEdges = graph.edges
    .map((edge) => {
      const from = idToWorkspace.get(edge.from);
      const to = idToWorkspace.get(edge.to);
      return from !== undefined && to !== undefined ? { from: from.name, to: to.name } : undefined;
    })
    .filter((edge): edge is Edge => edge !== undefined);

  const documentedNodeNames = [...idToWorkspace.values()]
    .filter((workspace): workspace is WorkspaceManifest => workspace !== undefined)
    .map((workspace) => workspace.name);

  return { documentedEdges, documentedNodeNames, unresolvedLabels };
}

function edgeKey(edge: Edge): string {
  return `${edge.from}->${edge.to}`;
}

export function checkDocumentParity(
  workspaces: readonly WorkspaceManifest[],
  runtimeEdges: readonly Edge[],
  resolved: ResolvedMermaidGraph,
): readonly Violation[] {
  const unresolvedViolations = resolved.unresolvedLabels.map((label) => ({
    kind: 'doc-parity' as const,
    message: `bounded-contexts.md mermaid node "${label}" does not resolve to any workspace package.json name or directory`,
  }));

  const runtimeKeys = new Set(runtimeEdges.map(edgeKey));
  const documentedKeys = new Set(resolved.documentedEdges.map(edgeKey));

  const missingFromDocument = runtimeEdges
    .filter((edge) => !documentedKeys.has(edgeKey(edge)))
    .map((edge) => ({
      kind: 'doc-parity' as const,
      message: `Runtime dependency ${edge.from} -> ${edge.to} is not documented in bounded-contexts.md`,
    }));

  const staleInDocument = resolved.documentedEdges
    .filter((edge) => !runtimeKeys.has(edgeKey(edge)))
    .map((edge) => ({
      kind: 'doc-parity' as const,
      message: `bounded-contexts.md documents ${edge.from} -> ${edge.to} but no matching runtime dependency exists`,
    }));

  const documentedNodeSet = new Set(resolved.documentedNodeNames);
  const missingNodes = workspaces
    .filter((workspace) => !documentedNodeSet.has(workspace.name))
    .map((workspace) => ({
      kind: 'doc-parity' as const,
      message: `Workspace ${workspace.name} (${workspace.workspaceDir}) has no node in the bounded-contexts.md dependency graph`,
    }));

  return [...unresolvedViolations, ...missingFromDocument, ...staleInDocument, ...missingNodes];
}

function main(): undefined {
  const workspaces = readWorkspaces(rootDirectory);
  const runtimeEdges = deriveRuntimeEdges(workspaces);
  const allEdges = deriveAllEdges(workspaces);

  const markdown = readFileSync(boundedContextsPath, 'utf8');
  const mermaidLines = extractMermaidBlock(markdown);
  if (mermaidLines === undefined) {
    process.stderr.write(
      `Could not locate a "${DEPENDENCY_GRAPH_HEADING}" mermaid block in ${boundedContextsPath}.\n`,
    );
    process.exit(1);
  }

  const parsedGraph = parseMermaidGraph(mermaidLines);
  if (parsedGraph === undefined) {
    process.stderr.write(
      `Could not parse the mermaid dependency graph in ${boundedContextsPath} -- unrecognized syntax.\n`,
    );
    process.exit(1);
  }

  const resolved = resolveMermaidGraph(parsedGraph, workspaces);

  const violations = [
    ...checkLeaf(workspaces),
    ...checkCycle(
      workspaces.map((workspace) => workspace.name),
      allEdges,
    ),
    ...checkDocumentParity(workspaces, runtimeEdges, resolved),
  ];

  if (violations.length > 0) {
    const report = violations
      .map((violation) => `  - [${violation.kind}] ${violation.message}`)
      .join('\n');
    process.stderr.write(
      `❌ Dependency graph guard found ${violations.length} violation(s):\n${report}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `✅ Dependency graph guard passed: ${KERNEL_PACKAGE} is the leaf, ${String(allEdges.length)} internal edges are acyclic, ${String(runtimeEdges.length)} runtime edges match bounded-contexts.md.\n`,
  );
  return undefined;
}

// Only run when invoked directly (`bun tools/…`), not when imported by the test.
if (import.meta.main) {
  main();
}
