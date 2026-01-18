import type { GraphEdgeKind } from '../../types';
import { findNearestPackageRoot } from './packageRoot';

export const getDeclarationFilesForImport = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  identifiers: import('typescript').Identifier[];
}): string[] => {
  const out = new Set<string>();
  for (const ident of args.identifiers) {
    const sym = args.checker.getSymbolAtLocation(ident);
    if (!sym) continue;
    const target =
      sym.flags & args.ts.SymbolFlags.Alias
        ? args.checker.getAliasedSymbol(sym)
        : sym;
    const decls = target.getDeclarations() ?? [];
    for (const d of decls) out.add(d.getSourceFile().fileName);
  }
  return Array.from(out);
};

export const filterCommanderRule = (args: {
  barrelAbsPath: string;
  declarationAbsPaths: string[];
  kind: GraphEdgeKind;
}): string[] => {
  // Commander rule is only applied for external barrels; callers decide when to
  // invoke this. We keep it here so it stays isolated and testable.
  void args.kind;
  const barrelRoot = findNearestPackageRoot(args.barrelAbsPath);
  if (!barrelRoot) return args.declarationAbsPaths;

  return args.declarationAbsPaths.filter((p) => {
    const declRoot = findNearestPackageRoot(p);
    return declRoot !== null && declRoot === barrelRoot;
  });
};
