/**
 * Requirements addressed:
 * - Deterministic serialization: sorted node keys, complete edges map.
 * - Edge de-duplication and deterministic edge ordering.
 * - Sparse metadata normalization with stable key insertion order.
 * - Node descriptions are normalized (trimmed) and omitted when empty.
 */

import type { DependencyGraph, GraphEdge, GraphNode, NodeId } from '../types';
import { makeMetadata, makeNode } from './nodes';

const sortKeys = <T>(rec: Record<string, T>): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const k of Object.keys(rec).sort((a, b) => a.localeCompare(b)))
    out[k] = rec[k];
  return out;
};

const normalizeNode = (n: GraphNode): GraphNode => {
  const md = n.metadata
    ? makeMetadata({
        hash: n.metadata.hash,
        isOutsideRoot: n.metadata.isOutsideRoot === true,
        size: n.metadata.size,
      })
    : undefined;
  const description =
    typeof n.description === 'string' && n.description.trim()
      ? n.description.trim()
      : undefined;
  return makeNode({
    id: n.id,
    kind: n.kind,
    language: n.language,
    ...(description ? { description } : {}),
    ...(md ? { metadata: md } : {}),
  });
};

const sortAndDedupeEdges = (edges: GraphEdge[]): GraphEdge[] => {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];
  for (const e of edges) {
    const key = `${e.target}\0${e.kind}\0${e.resolution}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => {
    const t = a.target.localeCompare(b.target);
    if (t) return t;
    const k = a.kind.localeCompare(b.kind);
    if (k) return k;
    return a.resolution.localeCompare(b.resolution);
  });
  return out;
};

export const finalizeGraph = (graph: DependencyGraph): DependencyGraph => {
  // Normalize nodes (including metadata key ordering) and sort keys.
  const normalizedNodes: Record<NodeId, GraphNode> = {};
  for (const [id, n] of Object.entries(graph.nodes))
    normalizedNodes[id] = normalizeNode(n);
  const nodes = sortKeys(normalizedNodes);

  // Complete edges map + normalize each edge list.
  const edgesOut: Record<NodeId, GraphEdge[]> = {};
  for (const id of Object.keys(nodes)) {
    edgesOut[id] = sortAndDedupeEdges(graph.edges[id] ?? []);
  }

  return { nodes, edges: sortKeys(edgesOut) };
};
