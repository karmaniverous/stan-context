/**
 * Requirements addressed:
 * - NodeId normalization rules (POSIX separators; absolute when outside root).
 * - Windows absolute normalization (for example, "C:/x").
 */

import path from 'node:path';

import type { NodeId } from '../types';

export const toPosixPath = (p: string): string => p.replace(/\\/g, '/');

const stripLeadingDotSlash = (p: string): string =>
  p.startsWith('./') ? p.slice(2) : p;

export const isPosixAbsolute = (p: string): boolean => p.startsWith('/');
export const isWindowsDriveAbsolute = (p: string): boolean =>
  /^[a-zA-Z]:\//.test(p);

export const isAbsoluteNodeId = (id: NodeId): boolean =>
  isPosixAbsolute(id) || isWindowsDriveAbsolute(id);

export const absPathToNodeId = (
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

export const nodeIdToAbsPath = (cwd: string, id: NodeId): string | null => {
  if (id.startsWith('node:')) return null;
  if (isAbsoluteNodeId(id)) return id;
  // Treat repo-relative NodeIds as paths under cwd.
  return path.join(cwd, toPosixPath(id));
};
