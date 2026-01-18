/**
 * Requirements addressed:
 * - Incrementalism via previousGraph:
 *   - Detect changed/new/deleted nodes by hash comparison (incl. externals).
 *   - Re-analyze changed nodes and transitive reverse dependencies.
 *   - Reuse nodes/edges from previousGraph for clean sources.
 */

import type { DependencyGraph, GraphEdge, GraphNode, NodeId } from '../types';
import { tryHashFileSha256 } from './hash';
import { nodeIdToAbsPath } from './paths';

export type IncrementalPlan = {
  dirtySourceIds: Set<NodeId>;
  reusedEdgesBySource: Record<NodeId, GraphEdge[]>;
  carriedNodes: Record<NodeId, GraphNode>;
  changedNodeIds: Set<NodeId>;
};

const buildReverseDeps = (
  edges: Record<NodeId, GraphEdge[]>,
): Map<NodeId, Set<NodeId>> => {
  const rev = new Map<NodeId, Set<NodeId>>();
  for (const [src, outs] of Object.entries(edges)) {
    for (const e of outs) {
      const set = rev.get(e.target) ?? new Set<NodeId>();
      set.add(src);
      rev.set(e.target, set);
    }
  }
  return rev;
};

const transitiveReverseClosure = (
  start: Iterable<NodeId>,
  rev: Map<NodeId, Set<NodeId>>,
): Set<NodeId> => {
  const out = new Set<NodeId>();
  const queue: NodeId[] = [];
  for (const id of start) {
    if (out.has(id)) continue;
    out.add(id);
    queue.push(id);
  }

  while (queue.length) {
    const id = queue.shift() as NodeId;
    const deps = rev.get(id);
    if (!deps) continue;
    for (const src of deps) {
      if (out.has(src)) continue;
      out.add(src);
      queue.push(src);
    }
  }

  return out;
};

const isHashComparable = (n: GraphNode): boolean =>
  (n.kind === 'source' || n.kind === 'external') &&
  typeof n.metadata?.hash === 'string';

export const planIncremental = async (args: {
  cwd: string;
  analyzableSourceIds: NodeId[];
  currentNodes: Record<NodeId, GraphNode>;
  previousGraph?: DependencyGraph;
}): Promise<IncrementalPlan> => {
  const analyzableSet = new Set(args.analyzableSourceIds);

  if (!args.previousGraph) {
    return {
      dirtySourceIds: new Set(args.analyzableSourceIds),
      reusedEdgesBySource: {},
      carriedNodes: {},
      changedNodeIds: new Set(args.analyzableSourceIds),
    };
  }

  const prev = args.previousGraph;
  const rev = buildReverseDeps(prev.edges);

  const changed = new Set<NodeId>();

  // (1) Compare current universe nodes against previous hashes.
  for (const [id, n] of Object.entries(args.currentNodes)) {
    if (!isHashComparable(n)) continue;
    const prevHash = prev.nodes[id]?.metadata?.hash;
    if (prevHash !== n.metadata?.hash) changed.add(id);
  }

  // (2) Detect deleted prior nodes (best-effort). Mark as changed to trigger
  // reverse-dep invalidation.
  for (const [id, prevNode] of Object.entries(prev.nodes)) {
    if (prevNode.kind !== 'source') continue;
    if (args.currentNodes[id]) continue;
    changed.add(id);
  }

  // (3) Re-hash previous source/external nodes to detect dependency changes.
  for (const [id, prevNode] of Object.entries(prev.nodes)) {
    if (!isHashComparable(prevNode)) continue;
    const abs = nodeIdToAbsPath(args.cwd, id);
    if (!abs) continue;
    const now = await tryHashFileSha256(abs);
    if (!now) continue;
    if (now.hash !== prevNode.metadata?.hash) changed.add(id);
  }

  // (4) Dirty set is transitive reverse-deps closure of changed nodes,
  // restricted to analyzable current sources.
  const closure = transitiveReverseClosure(changed, rev);
  const dirtySourceIds = new Set<NodeId>();
  for (const id of closure) {
    if (analyzableSet.has(id)) dirtySourceIds.add(id);
  }

  // (5) Reuse edges for clean analyzable sources.
  const reusedEdgesBySource: Record<NodeId, GraphEdge[]> = {};
  for (const id of args.analyzableSourceIds) {
    if (dirtySourceIds.has(id)) continue;
    const prevEdges = prev.edges[id];
    if (prevEdges) reusedEdgesBySource[id] = prevEdges;
  }

  // (6) Carry forward nodes referenced by reused edges so the graph has no
  // dangling targets (metadata may be stale; it will be refreshed when dirty).
  const referenced = new Set<NodeId>();
  for (const [src, outs] of Object.entries(reusedEdgesBySource)) {
    referenced.add(src);
    for (const e of outs) referenced.add(e.target);
  }

  const carriedNodes: Record<NodeId, GraphNode> = {};
  for (const id of referenced) {
    if (args.currentNodes[id]) continue;
    const prevNode = prev.nodes[id];
    if (prevNode) carriedNodes[id] = prevNode;
  }

  return {
    dirtySourceIds,
    reusedEdgesBySource,
    carriedNodes,
    changedNodeIds: changed,
  };
};
