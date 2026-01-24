/**
 * Requirements addressed:
 * - Define a deterministic, JSON-serializable DependencyGraph schema.
 * - Support NodeId semantics for source/external/builtin/missing nodes.
 * - Keep metadata sparse (omit null/false fields).
 * - Optional node descriptions are one-line summaries for TS/JS modules.
 */

export type NodeId = string;

export type HashSizeEnforcement = 'warn' | 'error' | 'ignore';

export type GraphNodeKind = 'source' | 'external' | 'builtin' | 'missing';
export type GraphLanguage = 'ts' | 'js' | 'json' | 'md' | 'other';

export type GraphNodeMetadata = {
  size?: number;
  hash?: string;
  isOutsideRoot?: true;
};

export type GraphNode = {
  id: NodeId;
  kind: GraphNodeKind;
  language: GraphLanguage;
  description?: string;
  metadata?: GraphNodeMetadata;
};

export type GraphEdgeKind = 'runtime' | 'type' | 'dynamic';
export type GraphEdgeResolution = 'explicit' | 'implicit';

export type GraphEdge = {
  target: NodeId;
  kind: GraphEdgeKind;
  resolution: GraphEdgeResolution;
};

export type DependencyGraph = {
  nodes: Record<NodeId, GraphNode>;
  edges: Record<NodeId, GraphEdge[]>;
};

export type GraphOptions = {
  cwd: string;
  /**
   * Injected TypeScript module instance to use for TS/JS analysis.
   *
   * This package does not attempt to resolve TypeScript implicitly. Callers MUST
   * provide either `typescript` or `typescriptPath`.
   */
  typescript?: typeof import('typescript');
  /**
   * Absolute path to a TypeScript entry module to load (for example, the result
   * of `require.resolve('typescript')` from the host environment).
   *
   * This is intended for hosts that want to control the TypeScript source
   * deterministically (stan-cli, IDE SDK, web service, etc.).
   */
  typescriptPath?: string;
  config?: {
    includes?: string[];
    excludes?: string[];
    anchors?: string[];
  };
  previousGraph?: DependencyGraph;
  /**
   * Policy for enforcing the invariant:
   * if `metadata.hash` is present for a file node, `metadata.size` should also be present.
   *
   * Default: `'warn'`.
   */
  hashSizeEnforcement?: HashSizeEnforcement;
  /**
   * Maximum prefix length of GraphNode.description (TS/JS only).
   *
   * When truncated, ASCII `...` is appended (not counted in the prefix limit).
   * Set to 0 to omit descriptions.
   */
  nodeDescriptionLimit?: number;
  /**
   * Which TSDoc tags are considered when deriving descriptions (TS/JS only).
   *
   * Tags MUST include the `@` prefix and match `^@\\w+$`.
   *
   * Defaults to `['@module', '@packageDocumentation']`.
   */
  nodeDescriptionTags?: string[];
  /**
   * Maximum number of GraphResult.errors entries returned. When truncated, the
   * final entry is a deterministic sentinel. Set to 0 to omit errors.
   */
  maxErrors?: number;
};

export type GraphResult = {
  graph: DependencyGraph;
  stats: {
    modules: number;
    edges: number;
    dirty: number;
  };
  errors: string[];
};

export const inferLanguageFromPath = (id: string): GraphLanguage => {
  const lower = id.toLowerCase();
  if (
    lower.endsWith('.d.ts') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx')
  )
    return 'ts';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'js';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'md';
  return 'other';
};
