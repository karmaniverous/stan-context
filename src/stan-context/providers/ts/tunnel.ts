/**
 * Requirements addressed:
 * - Barrel tunneling must emit implicit edges to the defining module(s) for
 *   named/default imports.
 * - Re-export barrels must be followed for both runtime and type exports:
 *   `export { X } from './x'` and `export type { X } from './x'`.
 * - `export * from './x'` must participate in tunneling for named imports.
 * - Namespace forwarding resolves to a module-level dependency (module file only).
 * - External “commander rule” boundary filtering remains caller-controlled.
 * - Robustness: re-export resolution MUST be AST-first; the TypeChecker is used
 *   only to expand a defining module into its declaration file(s) (merged
 *   declarations) once the correct target module is identified.
 */
import path from 'node:path';

import { packageDirectorySync } from 'package-directory';
import type * as tsLib from 'typescript';

import {
  createReexportTraversalCache,
  type GetSourceFile,
  type ResolveAbsPath,
  resolveDefiningExportsForName,
} from './reexportTraversal';

const packageRootCache = new Map<string, string | null>();

const findNearestPackageRoot = (absFile: string): string | null => {
  const start = path.dirname(absFile);
  if (packageRootCache.has(start))
    return packageRootCache.get(start) as string | null;

  const dir = packageDirectorySync({ cwd: start }) ?? null;
  packageRootCache.set(start, dir);
  return dir;
};

/**
 * Resolve tunneled file targets for requested export names.
 *
 * NOTE: Namespace forwarding yields a module-level target (module file only).
 */
export const getTunneledFilesForBarrelExportNames = (args: {
  ts: typeof tsLib;
  checker: tsLib.TypeChecker;
  barrelSourceFile: tsLib.SourceFile;
  exportNames: string[];
  resolveAbsPath: ResolveAbsPath;
  getSourceFile: GetSourceFile;
}): string[] => {
  const out = new Set<string>();

  const cache = createReexportTraversalCache();

  for (const requestedName of args.exportNames) {
    // AST-first: chase through re-export forwarding edges until reaching a
    // module that defines the (possibly renamed) export locally.
    const defining = resolveDefiningExportsForName({
      ts: args.ts,
      entrySourceFile: args.barrelSourceFile,
      exportName: requestedName,
      resolveAbsPath: args.resolveAbsPath,
      getSourceFile: args.getSourceFile,
      cache,
    });

    for (const d of defining) {
      // Namespace forwarding is a module-level dependency (no symbol lookup).
      if (d.kind === 'module') {
        out.add(d.absPath);
        continue;
      }

      const defSf = args.getSourceFile(d.absPath);
      if (!defSf) {
        out.add(d.absPath);
        continue;
      }

      // TypeChecker-only step: expand the defining module export to its
      // declaration files (handles merged declarations). If the checker can’t
      // resolve it, fall back to the defining module file itself.
      const moduleSym = args.checker.getSymbolAtLocation(defSf);
      if (!moduleSym) {
        out.add(d.absPath);
        continue;
      }

      let exports: tsLib.Symbol[] = [];
      try {
        exports = args.checker.getExportsOfModule(moduleSym);
      } catch {
        out.add(d.absPath);
        continue;
      }

      const sym = exports.find((s) => s.getName() === d.exportName);
      if (!sym) {
        out.add(d.absPath);
        continue;
      }

      const decls = sym.getDeclarations() ?? [];
      if (!decls.length) {
        out.add(d.absPath);
        continue;
      }
      for (const decl of decls) out.add(decl.getSourceFile().fileName);
    }
  }

  return Array.from(out);
};

export const filterCommanderRule = (args: {
  barrelAbsPath: string;
  declarationAbsPaths: string[];
}): string[] => {
  // Commander rule is only applied for external barrels; callers decide when to
  // invoke this. We keep it here so it stays isolated and testable.
  const barrelRoot = findNearestPackageRoot(args.barrelAbsPath);
  if (!barrelRoot) return args.declarationAbsPaths;

  return args.declarationAbsPaths.filter((p) => {
    const declRoot = findNearestPackageRoot(p);
    return declRoot !== null && declRoot === barrelRoot;
  });
};
