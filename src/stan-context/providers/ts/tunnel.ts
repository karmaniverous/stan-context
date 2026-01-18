import path from 'node:path';

import { packageDirectorySync } from 'package-directory';

const packageRootCache = new Map<string, string | null>();

const findNearestPackageRoot = (absFile: string): string | null => {
  const start = path.dirname(absFile);
  if (packageRootCache.has(start))
    return packageRootCache.get(start) as string | null;

  const dir = packageDirectorySync({ cwd: start }) ?? null;
  packageRootCache.set(start, dir);
  return dir;
};

const resolveAliasChain = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  symbol: import('typescript').Symbol;
}): import('typescript').Symbol => {
  let cur = args.symbol;
  const seen = new Set<import('typescript').Symbol>();
  while (cur.flags & args.ts.SymbolFlags.Alias) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const next = args.checker.getAliasedSymbol(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
};

export const getDeclarationFilesForImport = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  identifiers: import('typescript').Identifier[];
}): string[] => {
  const out = new Set<string>();
  for (const ident of args.identifiers) {
    const sym = args.checker.getSymbolAtLocation(ident);
    if (!sym) continue;
    const target = resolveAliasChain({
      ts: args.ts,
      checker: args.checker,
      symbol: sym,
    });
    const decls = target.getDeclarations() ?? [];
    for (const d of decls) out.add(d.getSourceFile().fileName);
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
