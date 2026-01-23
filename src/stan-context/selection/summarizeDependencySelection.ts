/**
 * Requirements addressed:
 * - Export a deterministic helper to compute dependency selection closure
 *   membership and aggregate sizing from an in-memory DependencyGraph (no FS).
 * - Match STAN dependency state semantics:
 *   - outgoing edges only
 *   - depth-limited expansion
 *   - edgeKinds filtering
 *   - excludes win (subtract after includes)
 * - Keep unknown node IDs (absent from graph.nodes) in results and warn.
 * - Drop builtin/missing nodes by default (configurable) and warn.
 * - Support configurable enforcement for the "metadata.hash implies metadata.size"
 *   invariant (warn default; strict throws; ignore silent).
 * - Deterministic output ordering for selectedNodeIds, largest, and warnings.
 */

import type {
  DependencyGraph,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  HashSizeEnforcement,
  NodeId,
} from '../types';

export type DependencyEdgeType = GraphEdgeKind;

export type DependencyStateEntry =
  | string
  | [string, number]
  | [string, number, DependencyEdgeType[]];

export type SummarizeDependencySelectionOptions = {
  defaultEdgeKinds?: DependencyEdgeType[];
  dropNodeKinds?: Array<'builtin' | 'missing'>;
  maxTop?: number;
  hashSizeEnforcement?: HashSizeEnforcement;
};

export type DependencySelectionSummary = {
  selectedNodeIds: string[];
  selectedCount: number;
  totalBytes: number;
  largest: Array<{ nodeId: string; bytes: number }>;
  warnings: string[];
};

const VALID_EDGE_KINDS: DependencyEdgeType[] = ['runtime', 'type', 'dynamic'];
const VALID_EDGE_KIND_SET = new Set<DependencyEdgeType>(VALID_EDGE_KINDS);

const DEFAULT_EDGE_KINDS: DependencyEdgeType[] = [...VALID_EDGE_KINDS];
const DEFAULT_DROP_NODE_KINDS: Array<'builtin' | 'missing'> = [
  'builtin',
  'missing',
];
const DEFAULT_MAX_TOP = 10;
const DEFAULT_HASH_SIZE_ENFORCEMENT: HashSizeEnforcement = 'warn';

const uniq = <T>(items: T[]): T[] => Array.from(new Set(items));

const clampInt = (n: unknown, min: number): number => {
  const v =
    typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : Number.NaN;
  return Number.isFinite(v) ? Math.max(min, v) : min;
};

const normalizeEdgeKinds = (args: {
  raw: unknown;
  fallback: DependencyEdgeType[];
  warnings: Set<string>;
  entryLabel: string;
}): DependencyEdgeType[] => {
  if (args.raw === undefined) return args.fallback;

  if (!Array.isArray(args.raw)) {
    args.warnings.add(
      `Invalid edgeKinds for ${args.entryLabel}: expected array; using none.`,
    );
    return [];
  }

  const filtered = args.raw.filter(
    (k): k is DependencyEdgeType =>
      typeof k === 'string' && VALID_EDGE_KIND_SET.has(k as DependencyEdgeType),
  );
  const out = uniq(filtered);

  const invalid = args.raw
    .filter((k) => typeof k === 'string')
    .filter((k) => !VALID_EDGE_KIND_SET.has(k as DependencyEdgeType));
  for (const k of uniq(invalid)) {
    args.warnings.add(
      `Invalid edgeKind for ${args.entryLabel}: ${k}; ignoring.`,
    );
  }

  if (args.raw.length > 0 && out.length === 0) {
    args.warnings.add(
      `No valid edgeKinds for ${args.entryLabel}; no edges will be traversed.`,
    );
  }

  return out;
};

const normalizeEntry = (args: {
  entry: DependencyStateEntry;
  defaultEdgeKinds: DependencyEdgeType[];
  warnings: Set<string>;
  index: number;
}): { nodeId: NodeId; depth: number; edgeKinds: DependencyEdgeType[] } => {
  const label = `entry[${String(args.index)}]`;

  if (typeof args.entry === 'string') {
    return { nodeId: args.entry, depth: 0, edgeKinds: args.defaultEdgeKinds };
  }

  // Tuple forms: [nodeId, depth] | [nodeId, depth, edgeKinds]
  const nodeId = args.entry[0];
  const depth = clampInt(args.entry[1], 0);
  const edgeKinds = normalizeEdgeKinds({
    raw: args.entry[2],
    fallback: args.defaultEdgeKinds,
    warnings: args.warnings,
    entryLabel: label,
  });

  if (typeof nodeId !== 'string' || !nodeId.trim()) {
    args.warnings.add(
      `Invalid nodeId for ${label}: expected non-empty string.`,
    );
    return { nodeId: '', depth: 0, edgeKinds: [] };
  }

  if (args.entry[1] !== depth) {
    // Only warn when the raw depth is present but not a safe integer >= 0.
    if (
      typeof args.entry[1] !== 'number' ||
      !Number.isFinite(args.entry[1]) ||
      args.entry[1] < 0 ||
      Math.floor(args.entry[1]) !== args.entry[1]
    ) {
      args.warnings.add(
        `Invalid depth for ${label}: expected integer >= 0; using ${String(
          depth,
        )}.`,
      );
    }
  }

  return { nodeId, depth, edgeKinds };
};

const expandClosure = (args: {
  graph: DependencyGraph;
  entries: DependencyStateEntry[];
  defaultEdgeKinds: DependencyEdgeType[];
  warnings: Set<string>;
}): Set<NodeId> => {
  const selected = new Set<NodeId>();
  const bestRemainingDepth = new Map<NodeId, number>();

  type Q = { id: NodeId; remaining: number; edgeKinds: DependencyEdgeType[] };
  const queue: Q[] = [];

  const push = (q: Q) => {
    const prev = bestRemainingDepth.get(q.id) ?? -1;
    if (q.remaining <= prev) return;
    bestRemainingDepth.set(q.id, q.remaining);
    queue.push(q);
  };

  args.entries.forEach((entry, i) => {
    const norm = normalizeEntry({
      entry,
      defaultEdgeKinds: args.defaultEdgeKinds,
      warnings: args.warnings,
      index: i,
    });
    if (!norm.nodeId) return;

    selected.add(norm.nodeId);
    push({ id: norm.nodeId, remaining: norm.depth, edgeKinds: norm.edgeKinds });
  });

  while (queue.length) {
    const cur = queue.shift() as Q;
    if (cur.remaining <= 0) continue;
    if (cur.edgeKinds.length === 0) continue;

    const outs: GraphEdge[] = args.graph.edges[cur.id] ?? [];
    for (const e of outs) {
      if (!cur.edgeKinds.includes(e.kind)) continue;
      selected.add(e.target);
      push({
        id: e.target,
        remaining: cur.remaining - 1,
        edgeKinds: cur.edgeKinds,
      });
    }
  }

  return selected;
};

const isFileNodeWithHash = (n: GraphNode): boolean =>
  (n.kind === 'source' || n.kind === 'external') &&
  typeof n.metadata?.hash === 'string';

const getBytesForNode = (n: GraphNode | undefined): number => {
  const size = n?.metadata?.size;
  return typeof size === 'number' && Number.isFinite(size) ? size : 0;
};

export const summarizeDependencySelection = (args: {
  graph: DependencyGraph;
  include: DependencyStateEntry[];
  exclude?: DependencyStateEntry[];
  options?: SummarizeDependencySelectionOptions;
}): DependencySelectionSummary => {
  const warnings = new Set<string>();

  const defaultEdgeKinds = uniq(
    args.options?.defaultEdgeKinds?.filter((k) => VALID_EDGE_KIND_SET.has(k)) ??
      DEFAULT_EDGE_KINDS,
  );

  const dropNodeKinds = uniq(
    args.options?.dropNodeKinds ?? DEFAULT_DROP_NODE_KINDS,
  );
  const maxTop =
    typeof args.options?.maxTop === 'number'
      ? clampInt(args.options.maxTop, 0)
      : DEFAULT_MAX_TOP;
  const hashSizeEnforcement =
    args.options?.hashSizeEnforcement ?? DEFAULT_HASH_SIZE_ENFORCEMENT;

  const includeSet = expandClosure({
    graph: args.graph,
    entries: args.include,
    defaultEdgeKinds,
    warnings,
  });

  const excludeSet = expandClosure({
    graph: args.graph,
    entries: args.exclude ?? [],
    defaultEdgeKinds,
    warnings,
  });

  // Excludes win: subtract after expanding both sides.
  for (const id of excludeSet) includeSet.delete(id);

  // Drop node kinds (default: builtin/missing) AFTER excludes subtraction.
  const dropped: Array<{ id: NodeId; kind: GraphNode['kind'] }> = [];
  for (const id of Array.from(includeSet)) {
    const n = args.graph.nodes[id];
    if (!n) continue; // unknown node IDs are retained
    if (
      (n.kind === 'builtin' && dropNodeKinds.includes('builtin')) ||
      (n.kind === 'missing' && dropNodeKinds.includes('missing'))
    ) {
      includeSet.delete(id);
      dropped.push({ id, kind: n.kind });
    }
  }
  dropped
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((d) => {
      warnings.add(`Dropped ${d.kind} node from selection: ${d.id}`);
    });

  const selectedNodeIds = Array.from(includeSet).sort((a, b) =>
    a.localeCompare(b),
  );

  // Unknown node IDs: keep them but warn.
  for (const id of selectedNodeIds) {
    if (!Object.prototype.hasOwnProperty.call(args.graph.nodes, id)) {
      warnings.add(`Selected nodeId not present in graph.nodes: ${id}`);
    }
  }

  // Size aggregation + invariant enforcement.
  const missingSizeHashed: string[] = [];
  const missingSizeFileNode: string[] = [];

  let totalBytes = 0;
  const sized: Array<{ nodeId: string; bytes: number }> = [];
  for (const id of selectedNodeIds) {
    const n = args.graph.nodes[id];
    const bytes = getBytesForNode(n);
    totalBytes += bytes;
    sized.push({ nodeId: id, bytes });

    if (!n) continue;

    const isFile = n.kind === 'source' || n.kind === 'external';
    const sizeMissing = typeof n.metadata?.size !== 'number';
    if (isFile && sizeMissing) {
      missingSizeFileNode.push(id);
    }
    if (isFileNodeWithHash(n) && sizeMissing) {
      missingSizeHashed.push(id);
    }
  }

  const hashedMissing = uniq(missingSizeHashed).sort((a, b) =>
    a.localeCompare(b),
  );
  const hashedMissingSet = new Set<string>(hashedMissing);

  // File nodes missing size but NOT part of the hash=>size invariant surface.
  // (In ignore mode, we suppress warnings for hashed-node violations.)
  const fileMissingNonHashed = uniq(missingSizeFileNode)
    .filter((id) => !hashedMissingSet.has(id))
    .sort((a, b) => a.localeCompare(b));

  switch (hashSizeEnforcement) {
    case 'error': {
      if (hashedMissing.length > 0) {
        const preview = hashedMissing.slice(0, 10).join(', ');
        const suffix = hashedMissing.length > 10 ? ' ...' : '';
        throw new Error(
          `metadata.size missing for hashed nodes (${String(
            hashedMissing.length,
          )}): ${preview}${suffix}`,
        );
      }
      break;
    }
    case 'warn': {
      for (const id of hashedMissing) {
        warnings.add(`metadata.size missing for hashed node: ${id}`);
      }
      break;
    }
    case 'ignore': {
      break;
    }
    default: {
      const _exhaustive: never = hashSizeEnforcement;
      void _exhaustive;
    }
  }

  for (const id of fileMissingNonHashed) {
    warnings.add(`metadata.size missing for file node: ${id}`);
  }

  const largest = sized
    .slice()
    .sort((a, b) => {
      const d = b.bytes - a.bytes;
      if (d) return d;
      return a.nodeId.localeCompare(b.nodeId);
    })
    .slice(0, maxTop);

  return {
    selectedNodeIds,
    selectedCount: selectedNodeIds.length,
    totalBytes,
    largest,
    warnings: Array.from(warnings).sort((a, b) => a.localeCompare(b)),
  };
};

export default { summarizeDependencySelection };
