/**
 * @module
 * Encode a DependencyGraph into compact dependency meta (v2) for context mode.
 *
 * Requirements addressed:
 * - Reduce assistant context consumption:
 *   - short keys, edges embedded in nodes, tuple edges.
 * - Preserve reasoning signal:
 *   - keep NodeId strings as keys and edge targets (no node indexing by default).
 * - De-duplicate edges:
 *   - one edge per (source,target) pair via bitmask merging.
 * - Hash encoding for meta:
 *   - convert SHA-256 hex hashes to a 128-bit (16-byte) base64url prefix.
 */

import type {
  DependencyGraph,
  GraphEdgeKind,
  GraphEdgeResolution,
} from '../types';
import {
  DEPENDENCY_META_SCHEMA_VERSION,
  type DependencyMeta,
  type DependencyMetaEdge,
  type DependencyMetaNode,
  type DependencyMetaNodeKind,
  EDGE_KIND_MASK,
  EDGE_RES_EXPLICIT,
  EDGE_RES_MASK,
  NODE_KIND,
} from './types';

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

export const sha256HexToBase64Url128 = (hex: string): string => {
  if (!SHA256_HEX_RE.test(hex)) {
    throw new Error(
      `Invalid SHA-256 hex hash (expected 64 hex chars): ${String(hex)}`,
    );
  }
  const bytes = Buffer.from(hex, 'hex'); // 32 bytes
  const short = bytes.subarray(0, 16); // 128-bit prefix
  // Ensure no padding for compactness and stable comparisons.
  return short.toString('base64url').replace(/=+$/, '');
};

const edgeKindToMask = (k: GraphEdgeKind): number => {
  switch (k) {
    case 'runtime':
      return EDGE_KIND_MASK.runtime;
    case 'type':
      return EDGE_KIND_MASK.type;
    case 'dynamic':
      return EDGE_KIND_MASK.dynamic;
    default: {
      const _exhaustive: never = k;
      return _exhaustive;
    }
  }
};

const edgeResToMask = (r: GraphEdgeResolution): number => {
  switch (r) {
    case 'explicit':
      return EDGE_RES_MASK.explicit;
    case 'implicit':
      return EDGE_RES_MASK.implicit;
    default: {
      const _exhaustive: never = r;
      return _exhaustive;
    }
  }
};

const nodeKindToCode = (
  k: DependencyGraph['nodes'][string]['kind'],
): DependencyMetaNodeKind => {
  switch (k) {
    case 'source':
      return NODE_KIND.source;
    case 'external':
      return NODE_KIND.external;
    case 'builtin':
      return NODE_KIND.builtin;
    case 'missing':
      return NODE_KIND.missing;
    default: {
      const _exhaustive: never = k;
      return _exhaustive;
    }
  }
};

export const encodeDependencyMeta = (args: {
  graph: DependencyGraph;
}): DependencyMeta => {
  const outNodes: Record<string, DependencyMetaNode> = {};

  for (const [id, n] of Object.entries(args.graph.nodes)) {
    const k = nodeKindToCode(n.kind);

    const out: DependencyMetaNode = { k };

    const size = n.metadata?.size;
    if (typeof size === 'number' && Number.isFinite(size)) out.s = size;

    const hash = n.metadata?.hash;
    if (typeof hash === 'string' && hash) {
      // For v2 meta, we store 128-bit base64url. Convert from expected sha256 hex.
      out.h = sha256HexToBase64Url128(hash);
    }

    const desc = n.description;
    if (typeof desc === 'string' && desc.trim()) out.d = desc.trim();

    // Merge edges by target: one edge per (source,target) pair.
    const merged = new Map<string, { kindMask: number; resMask: number }>();
    const outs = args.graph.edges[id] ?? [];
    for (const e of outs) {
      const prev = merged.get(e.target) ?? { kindMask: 0, resMask: 0 };
      prev.kindMask |= edgeKindToMask(e.kind);
      prev.resMask |= edgeResToMask(e.resolution);
      merged.set(e.target, prev);
    }

    if (merged.size > 0) {
      const edges: DependencyMetaEdge[] = Array.from(merged.entries())
        .map(([target, m]) => {
          // Omit resMask when explicit-only to reduce repetition.
          return m.resMask === EDGE_RES_EXPLICIT
            ? ([target, m.kindMask] as const)
            : ([target, m.kindMask, m.resMask] as const);
        })
        .sort((a, b) => a[0].localeCompare(b[0]));
      out.e = edges;
    }

    outNodes[id] = out;
  }

  return { v: DEPENDENCY_META_SCHEMA_VERSION, n: outNodes };
};

export default { encodeDependencyMeta };
