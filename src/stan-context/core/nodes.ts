/**
 * Requirements addressed:
 * - Sparse metadata fields (omit null/false).
 * - Deterministic metadata key ordering when present: hash, isOutsideRoot, size.
 * - Node descriptions are optional and omitted when empty.
 */

import path from 'node:path';

import type {
  GraphLanguage,
  GraphNode,
  GraphNodeKind,
  GraphNodeMetadata,
  NodeId,
} from '../types';
import { hashFileSha256 } from './hash';

// NOTE: Intentionally inlined (instead of importing from ../types) to avoid
// Vitest SSR instability where named exports can be transiently unavailable.
const inferLanguageFromPath = (id: string): GraphLanguage => {
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

// NOTE: Intentionally inlined (instead of importing from ./paths) to avoid
// Vitest SSR instability observed for this module when importing absPathToNodeId.
const toPosixPath = (p: string): string => p.replace(/\\/g, '/');
const stripLeadingDotSlash = (p: string): string =>
  p.startsWith('./') ? p.slice(2) : p;

const absPathToNodeId = (
  absPath: string,
  cwd: string,
): { id: NodeId; isOutsideRoot: boolean } => {
  const absResolved = path.resolve(absPath);
  const cwdResolved = path.resolve(cwd);

  const absPosix = toPosixPath(absResolved);
  const cwdPosix = toPosixPath(cwdResolved).replace(/\/+$/, '');

  if (absPosix === cwdPosix) return { id: '', isOutsideRoot: false };
  if (absPosix.startsWith(`${cwdPosix}/`)) {
    const rel = absPosix.slice(cwdPosix.length + 1);
    return { id: stripLeadingDotSlash(rel), isOutsideRoot: false };
  }
  return { id: absPosix, isOutsideRoot: true };
};

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
  description?: string;
  metadata?: GraphNodeMetadata;
}): GraphNode => ({
  ...(typeof args.description === 'string' && args.description.trim()
    ? { description: args.description.trim() }
    : {}),
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
