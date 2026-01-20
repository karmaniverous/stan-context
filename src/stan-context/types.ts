/**
 * Requirements addressed:
 * - Define a deterministic, JSON-serializable DependencyGraph schema.
 * - Support NodeId semantics for source/external/builtin/missing nodes.
 * - Keep metadata sparse (omit null/false fields).
 * - Optional node descriptions are one-line summaries for TS/JS modules.
 */

export type NodeId = string;

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
  config?: {
    includes?: string[];
    excludes?: string[];
    anchors?: string[];
  };
  previousGraph?: DependencyGraph;
  /**
   * Maximum length of GraphNode.description (TS/JS only). Uses ASCII `...` when
   * truncated. Set to 0 to omit descriptions.
   */
  nodeDescriptionLimit?: number;
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
