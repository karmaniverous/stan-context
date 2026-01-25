/**
 * @module
 * Compact dependency meta (v2) types for context-mode interop.
 *
 * Requirements addressed:
 * - Provide an assistant-friendly, compact JSON schema for dependency meta that:
 *   - preserves NodeId strings for reasoning,
 *   - stores edges as tuples (one per source-target pair),
 *   - uses bitmasks for edge kind/resolution,
 *   - supports 128-bit base64url hashes for integrity-sensitive staging checks.
 */

import type { NodeId } from '../types';

export const DEPENDENCY_META_SCHEMA_VERSION = 2 as const;
export type DependencyMetaSchemaVersion = typeof DEPENDENCY_META_SCHEMA_VERSION;

// Node kind indices (stable decode table; guaranteed in system prompt).
export const NODE_KIND = {
  source: 0,
  external: 1,
  builtin: 2,
  missing: 3,
} as const;
export type DependencyMetaNodeKind = (typeof NODE_KIND)[keyof typeof NODE_KIND];

// Edge kind mask bits (stable decode table).
export const EDGE_KIND_MASK = {
  runtime: 1,
  type: 2,
  dynamic: 4,
} as const;
export const EDGE_KIND_ALL =
  EDGE_KIND_MASK.runtime | EDGE_KIND_MASK.type | EDGE_KIND_MASK.dynamic;

// Edge resolution mask bits (meta only; optional per edge).
export const EDGE_RES_MASK = {
  explicit: 1,
  implicit: 2,
} as const;
export const EDGE_RES_EXPLICIT = EDGE_RES_MASK.explicit;
export const EDGE_RES_BOTH = EDGE_RES_MASK.explicit | EDGE_RES_MASK.implicit;

/**
 * A compact edge tuple.
 *
 * Tuple forms:
 * - [targetId, kindMask] =\> resolution defaults to explicit-only (1)
 * - [targetId, kindMask, resMask] =\> explicit/implicit/both
 */
export type DependencyMetaEdge =
  | [target: NodeId, kindMask: number]
  | [target: NodeId, kindMask: number, resMask: number];

export type DependencyMetaNode = {
  /** Node kind index (stable decode table). */
  k: DependencyMetaNodeKind;
  /** File size (bytes). Typically present for source/external nodes. */
  s?: number;
  /** 128-bit base64url hash (no padding). Typically present for source/external. */
  h?: string;
  /** Optional one-line description (TS/JS only). */
  d?: string;
  /** Outgoing edges, compact tuples. */
  e?: DependencyMetaEdge[];
};

export type DependencyMeta = {
  /** Schema version. */
  v: DependencyMetaSchemaVersion;
  /** Node map keyed by NodeId (string). */
  n: Record<NodeId, DependencyMetaNode>;
};
