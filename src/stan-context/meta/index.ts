/**
 * @module
 * Compact dependency meta (context-mode) exports.
 */

export {
  encodeDependencyMeta,
  sha256HexToBase64Url128,
} from './encodeDependencyMeta';
export type {
  DependencyMeta,
  DependencyMetaEdge,
  DependencyMetaNode,
} from './types';
export {
  DEPENDENCY_META_SCHEMA_VERSION,
  EDGE_KIND_ALL,
  EDGE_KIND_MASK,
  EDGE_RES_BOTH,
  EDGE_RES_EXPLICIT,
  EDGE_RES_MASK,
  NODE_KIND,
} from './types';
