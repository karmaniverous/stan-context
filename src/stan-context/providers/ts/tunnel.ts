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

const getExportedSymbolFromReexport = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  spec: import('typescript').ExportSpecifier;
}): import('typescript').Symbol | null => {
  const name = args.spec.propertyName?.text ?? args.spec.name.text;

  const named = args.spec.parent;
  const exportDecl = named.parent;
  if (!args.ts.isExportDeclaration(exportDecl) || !exportDecl.moduleSpecifier)
    return null;

  const moduleSym = args.checker.getSymbolAtLocation(
    exportDecl.moduleSpecifier,
  );
  if (!moduleSym) return null;

  const resolvedModule = resolveAliasChain({
    ts: args.ts,
    checker: args.checker,
    symbol: moduleSym,
  });

  let exports: import('typescript').Symbol[] = [];
  try {
    exports = args.checker.getExportsOfModule(resolvedModule);
  } catch {
    return null;
  }

  return exports.find((s) => s.getName() === name) ?? null;
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
    // If this is an export specifier (including re-exports), follow its target
    // symbol so we tunnel to the file that actually defines the symbol.
    if (args.ts.isExportSpecifier(d)) {
      const target = getExportedSymbolFromReexport({
        ts: args.ts,
        checker: args.checker,
        spec: d,
      });
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

export const getDeclarationFilesForImportedIdentifiers = (args: {
  ts: typeof import('typescript');
  checker: import('typescript').TypeChecker;
  identifiers: import('typescript').Identifier[];
}): string[] => {
  const out = new Set<string>();
  const seenSymbols = new Set<import('typescript').Symbol>();

  for (const ident of args.identifiers) {
    const sym = args.checker.getSymbolAtLocation(ident);
    if (!sym) continue;
    addDeclarationFiles({
      ts: args.ts,
      checker: args.checker,
      symbol: sym,
      out,
      seenSymbols,
    });
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
