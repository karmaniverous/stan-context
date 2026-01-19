/**
 * Requirements addressed:
 * - Barrel tunneling must emit implicit edges to the defining module(s) for
 *   named/default imports.
 * - Re-export barrels must be followed for both runtime and type exports:
 *   `export { X } from './x'` and `export type { X } from './x'`.
 * - External “commander rule” boundary filtering remains caller-controlled.
 */
import path from 'node:path';

import { packageDirectorySync } from 'package-directory';
import type * as tsLib from 'typescript';

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
  ts: typeof tsLib;
  checker: tsLib.TypeChecker;
  symbol: tsLib.Symbol;
}): tsLib.Symbol => {
  let cur = args.symbol;
  const seen = new Set<tsLib.Symbol>();
  while (cur.flags & args.ts.SymbolFlags.Alias) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const next = args.checker.getAliasedSymbol(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
};

const getExportedFromName = (spec: tsLib.ExportSpecifier): string =>
  spec.propertyName?.text ?? spec.name.text;

const getSpecifierLookupNode = (
  spec: tsLib.ExportSpecifier,
): tsLib.Identifier => spec.propertyName ?? spec.name;

const resolveExportSpecifierTargetSymbol = (args: {
  ts: typeof tsLib;
  checker: tsLib.TypeChecker;
  spec: tsLib.ExportSpecifier;
  fromSymbol: tsLib.Symbol;
}): tsLib.Symbol | null => {
  const { ts, checker, spec } = args;

  const fromResolved = resolveAliasChain({
    ts,
    checker,
    symbol: args.fromSymbol,
  });

  // Preferred: ask the checker for the symbol at the specifier name/property.
  // For `export { X } from './x'`, this often resolves directly to X (or an
  // alias of X) in the target module.
  const direct = checker.getSymbolAtLocation(getSpecifierLookupNode(spec));
  if (direct) {
    const directResolved = resolveAliasChain({ ts, checker, symbol: direct });
    if (directResolved !== fromResolved) return direct;
  }

  // Fallback: when we only have an ExportSpecifier declaration, follow the
  // enclosing `export ... from '<module>'` into the target module’s exports.
  const named = spec.parent;
  const exportDecl = named.parent;
  if (!ts.isExportDeclaration(exportDecl) || !exportDecl.moduleSpecifier)
    return null;

  const moduleSym = checker.getSymbolAtLocation(exportDecl.moduleSpecifier);
  if (!moduleSym) return null;

  const resolvedModule = resolveAliasChain({ ts, checker, symbol: moduleSym });

  let exports: tsLib.Symbol[] = [];
  try {
    exports = checker.getExportsOfModule(resolvedModule);
  } catch {
    return null;
  }

  const name = getExportedFromName(spec);
  return exports.find((s) => s.getName() === name) ?? null;
};

const addDeclarationFiles = (args: {
  ts: typeof tsLib;
  checker: tsLib.TypeChecker;
  symbol: tsLib.Symbol;
  out: Set<string>;
  seenSymbols: Set<tsLib.Symbol>;
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
      const target = resolveExportSpecifierTargetSymbol({
        ts: args.ts,
        checker: args.checker,
        spec: d,
        fromSymbol: resolved,
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
  ts: typeof tsLib;
  checker: tsLib.TypeChecker;
  identifiers: tsLib.Identifier[];
}): string[] => {
  const out = new Set<string>();
  const seenSymbols = new Set<tsLib.Symbol>();

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
