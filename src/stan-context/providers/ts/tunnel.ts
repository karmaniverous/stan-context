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

const addDeclarationFiles = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  symbol: import('typescript').Symbol;
  out: Set<string>;
  seenSymbols: Set<import('typescript').Symbol>;
}): void => {
  const resolved = resolveAliasChain({
    ts: args.ts,
    checker: args.checker,
    symbol: args.symbol,
  });

  if (args.seenSymbols.has(resolved)) return;
  args.seenSymbols.add(resolved);

  const decls = resolved.getDeclarations() ?? [];
  for (const d of decls) {
    // If this is a re-export specifier, follow the local target symbol so we
    // tunnel to the file that actually defines the symbol.
    if (args.ts.isExportSpecifier(d)) {
      const target = args.checker.getExportSpecifierLocalTargetSymbol(d);
      if (target) {
        addDeclarationFiles({
          ts: args.ts,
          checker: args.checker,
          symbol: target,
          out: args.out,
          seenSymbols: args.seenSymbols,
        });
        continue;
      }
    }

    args.out.add(d.getSourceFile().fileName);
  }
};

const getModuleSymbol = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  moduleSourceFile: import('typescript').SourceFile;
}): import('typescript').Symbol | null => {
  const sym = args.checker.getSymbolAtLocation(args.moduleSourceFile);
  if (sym) return sym;
  const anySf = args.moduleSourceFile as unknown as { symbol?: unknown };
  if (anySf.symbol && typeof anySf.symbol === 'object')
    return anySf.symbol as import('typescript').Symbol;
  return null;
};

export const getDeclarationFilesForExportName = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  moduleSourceFile: import('typescript').SourceFile;
  exportName: string;
}): string[] => {
  const mod = getModuleSymbol({
    ts: args.ts,
    checker: args.checker,
    moduleSourceFile: args.moduleSourceFile,
  });
  if (!mod) return [];

  let exports: import('typescript').Symbol[] = [];
  try {
    exports = args.checker.getExportsOfModule(mod);
  } catch {
    return [];
  }

  const name = args.exportName;
  const sym = exports.find((s) => s.getName() === name);
  if (!sym) return [];

  const out = new Set<string>();
  addDeclarationFiles({
    ts: args.ts,
    checker: args.checker,
    symbol: sym,
    out,
    seenSymbols: new Set<import('typescript').Symbol>(),
  });

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
