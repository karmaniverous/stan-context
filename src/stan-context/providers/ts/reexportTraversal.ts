/**
 * Requirements addressed:
 * - Re-export barrels are a syntactic forwarding graph; tunneling through them
 *   MUST be AST-first for robustness across TypeScript versions and `.d.ts`.
 * - Always chase until a “true defining file”:
 *   follow re-export chains until reaching a module that defines the requested
 *   export name locally (not merely forwarding it).
 * - `export * from './x'` participates in tunneling; avoid infinite recursion
 *   via cycle detection and memoization.
 * - Forwarding MUST include “import then export” patterns, including namespace
 *   forwarding as a module-level target.
 * - `export default function/class` MUST be treated as defining `default`.
 */

import type * as tsLib from 'typescript';

import { sourceFileDefinesExportName } from './reexportTraversal/defines';
import { collectForwardingTargetsForName } from './reexportTraversal/forwarding';
import { collectImportBindings } from './reexportTraversal/importBindings';
import { collectLocalTopLevelDeclarationNames } from './reexportTraversal/locals';

export type ResolveAbsPath = (
  fromAbsPath: string,
  specifier: string,
) => string | null;
export type GetSourceFile = (absPath: string) => tsLib.SourceFile | undefined;

export type DefiningExport =
  | {
      kind: 'symbol';
      absPath: string;
      /**
       * Export name as it exists in the defining module.
       * Example: `export { A as B } from './a'` means requesting `B` resolves to
       * defining module `./a` with `exportName: 'A'`.
       */
      exportName: string;
    }
  | {
      /**
       * Namespace forwarding resolves to a module-level dependency (not a
       * symbol-level export name).
       */
      kind: 'module';
      absPath: string;
    };

export type ReexportTraversalCache = {
  memo: Map<string, DefiningExport[]>;
};

export const createReexportTraversalCache = (): ReexportTraversalCache => ({
  memo: new Map(),
});

const uniqByKey = <T>(items: T[], key: (t: T) => string): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
};

export const resolveDefiningExportsForName = (args: {
  ts: typeof tsLib;
  entrySourceFile: tsLib.SourceFile;
  exportName: string;
  resolveAbsPath: ResolveAbsPath;
  getSourceFile: GetSourceFile;
  cache?: ReexportTraversalCache;
}): DefiningExport[] => {
  const { ts, entrySourceFile, resolveAbsPath, getSourceFile } = args;
  const cache = args.cache ?? createReexportTraversalCache();

  const visit = (
    sourceFile: tsLib.SourceFile,
    exportName: string,
    stack: Set<string>,
  ): DefiningExport[] => {
    const key = `${sourceFile.fileName}\0${exportName}`;
    const memo = cache.memo.get(key);
    if (memo) return memo;

    if (stack.has(key)) return [];
    stack.add(key);

    const localNames = collectLocalTopLevelDeclarationNames({
      ts,
      sourceFile,
    });
    const imports = collectImportBindings({ ts, sourceFile });

    const out: DefiningExport[] = [];

    if (
      sourceFileDefinesExportName({
        ts,
        sourceFile,
        exportName,
        localNames,
      })
    ) {
      out.push({ kind: 'symbol', absPath: sourceFile.fileName, exportName });
    }

    // Follow forwarding edges for this name (re-exports and import->export forwarding).
    const targets = collectForwardingTargetsForName({
      ts,
      sourceFile,
      exportName,
      localNames,
      imports,
    });
    for (const t of targets) {
      const abs = resolveAbsPath(sourceFile.fileName, t.specifier);
      if (!abs) continue;
      const nextSf = getSourceFile(abs);
      if (!nextSf) continue;

      if (t.kind === 'module') {
        out.push({ kind: 'module', absPath: nextSf.fileName });
        continue;
      }

      out.push(...visit(nextSf, t.importName, stack));
    }

    const uniq = uniqByKey(out, (d) =>
      d.kind === 'module'
        ? `module\0${d.absPath}`
        : `symbol\0${d.absPath}\0${d.exportName}`,
    );
    cache.memo.set(key, uniq);
    stack.delete(key);
    return uniq;
  };

  return visit(entrySourceFile, args.exportName, new Set<string>());
};

/**
 * Default export is provided as an SSR-stable namespace for tests.
 * Named exports remain the primary API for production code.
 */
export default {
  createReexportTraversalCache,
  resolveDefiningExportsForName,
};
