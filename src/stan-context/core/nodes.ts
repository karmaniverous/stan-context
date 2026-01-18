/**
 * Requirements addressed:
 * - Sparse metadata fields (omit null/false).
 * - Deterministic metadata key ordering when present: hash, isOutsideRoot, size.
 */

import type {
  GraphLanguage,
  GraphNode,
  GraphNodeKind,
  GraphNodeMetadata,
  NodeId,
} from '../types';
import { inferLanguageFromPath } from '../types';
import { hashFileSha256 } from './hash';
import { absPathToNodeId } from './paths';

export const makeMetadata = (input: {
  hash?: string | null;
  isOutsideRoot?: boolean;
  size?: number | null;
}): GraphNodeMetadata | undefined => {
  const { hash, isOutsideRoot, size } = input;
  const out: GraphNodeMetadata = {};
  if (hash) out.hash = hash;
  if (isOutsideRoot) out.isOutsideRoot = true;
  if (typeof size === 'number') out.size = size;
  return Object.keys(out).length ? out : undefined;
};

export const makeNode = (args: {
  id: NodeId;
  kind: GraphNodeKind;
  language: GraphLanguage;
  metadata?: GraphNodeMetadata;
}): GraphNode => ({
  id: args.id,
  kind: args.kind,
  language: args.language,
  ...(args.metadata ? { metadata: args.metadata } : {}),
});

export const makeHashedFileNode = async (args: {
  absPath: string;
  cwd: string;
  kind: 'source' | 'external';
}): Promise<GraphNode> => {
  const { id, isOutsideRoot } = absPathToNodeId(args.absPath, args.cwd);
  const { size, hash } = await hashFileSha256(args.absPath);
  const language = inferLanguageFromPath(id);
  return makeNode({
    id,
    kind: args.kind,
    language,
    metadata: makeMetadata({ hash, isOutsideRoot, size }),
  });
};
