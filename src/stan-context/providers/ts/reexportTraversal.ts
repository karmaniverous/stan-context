/**
 * Requirements addressed:
 * - Re-export barrels are a syntactic forwarding graph; tunneling through them
 *   MUST be AST-first for robustness across TypeScript versions and `.d.ts`.
 * - Always chase until a “true defining file”:
 *   follow re-export chains until reaching a module that defines the requested
 *   export name locally (not merely forwarding it).
 * - `export * from './x'` participates in tunneling; avoid infinite recursion
 *   via cycle detection and memoization.
 */

import type * as tsLib from 'typescript';

export type ResolveAbsPath = (
  fromAbsPath: string,
  specifier: string,
) => string | null;
export type GetSourceFile = (absPath: string) => tsLib.SourceFile | undefined;

export type DefiningExport = {
  absPath: string;
  /**
   * Export name as it exists in the defining module.
   * Example: `export { A as B } from './a'` means requesting `B` resolves to
   * defining module `./a` with `exportName: 'A'`.
   */
  exportName: string;
};

export type ReexportTraversalCache = {
  memo: Map<string, DefiningExport[]>;
};

export const createReexportTraversalCache = (): ReexportTraversalCache => ({
  memo: new Map(),
});

const isStringLiteralLike = (
  ts: typeof tsLib,
  n: tsLib.Node,
): n is tsLib.StringLiteralLike =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

const moduleExportNameToText = (
  ts: typeof tsLib,
  n: tsLib.ModuleExportName,
): string => {
  // ModuleExportName is Identifier | StringLiteral.
  return ts.isIdentifier(n) ? n.text : n.text;
};

const hasExportModifier = (ts: typeof tsLib, n: tsLib.Node): boolean => {
  if (!ts.canHaveModifiers(n)) return false;
  const mods = ts.getModifiers(n);
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
};

const collectLocalTopLevelDeclarationNames = (args: {
  ts: typeof tsLib;
  sourceFile: tsLib.SourceFile;
}): Set<string> => {
  const { ts, sourceFile } = args;
  const names = new Set<string>();

  for (const s of sourceFile.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) names.add(s.name.text);
    if (ts.isClassDeclaration(s) && s.name) names.add(s.name.text);
    if (ts.isInterfaceDeclaration(s)) names.add(s.name.text);
    if (ts.isTypeAliasDeclaration(s)) names.add(s.name.text);
    if (ts.isEnumDeclaration(s)) names.add(s.name.text);
    if (ts.isModuleDeclaration(s) && ts.isIdentifier(s.name))
      names.add(s.name.text);
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        // Only handle simple identifier declarations.
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
      }
    }
  }

  return names;
};

const sourceFileDefinesExportName = (args: {
  ts: typeof tsLib;
  sourceFile: tsLib.SourceFile;
  exportName: string;
  localNames: Set<string>;
}): boolean => {
  const { ts, sourceFile, exportName, localNames } = args;

  if (exportName === 'default') {
    for (const s of sourceFile.statements) {
      if (ts.isExportAssignment(s) && s.isExportEquals !== true) return true;
    }
    return false;
  }

  for (const s of sourceFile.statements) {
    // `export function Foo() {}` etc.
    if (hasExportModifier(ts, s)) {
      if (
        (ts.isFunctionDeclaration(s) ||
          ts.isClassDeclaration(s) ||
          ts.isInterfaceDeclaration(s) ||
          ts.isTypeAliasDeclaration(s) ||
          ts.isEnumDeclaration(s)) &&
        s.name?.text === exportName
      ) {
        return true;
      }

      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === exportName)
            return true;
        }
      }
    }

    // `export { Foo };` where Foo is defined locally in this file.
    if (ts.isExportDeclaration(s) && !s.moduleSpecifier && s.exportClause) {
      if (!ts.isNamedExports(s.exportClause)) continue;
      for (const el of s.exportClause.elements) {
        const exported = el.name.text;
        if (exported !== exportName) continue;
        const local = el.propertyName
          ? moduleExportNameToText(ts, el.propertyName)
          : el.name.text;
        if (localNames.has(local)) return true;
      }
    }
  }

  return false;
};

const collectReexportTargetsForName = (args: {
  ts: typeof tsLib;
  sourceFile: tsLib.SourceFile;
  exportName: string;
}): Array<{ specifier: string; importName: string }> => {
  const { ts, sourceFile, exportName } = args;
  const out: Array<{ specifier: string; importName: string }> = [];

  for (const s of sourceFile.statements) {
    if (!ts.isExportDeclaration(s) || !s.moduleSpecifier) continue;
    if (!isStringLiteralLike(ts, s.moduleSpecifier)) continue;
    const spec = s.moduleSpecifier.text;

    // `export * from './x'`
    if (!s.exportClause) {
      out.push({ specifier: spec, importName: exportName });
      continue;
    }

    // `export { X } from './x'` and `export type { X } from './x'`
    if (ts.isNamedExports(s.exportClause)) {
      for (const el of s.exportClause.elements) {
        const exported = el.name.text;
        if (exported !== exportName) continue;
        const importName = el.propertyName
          ? moduleExportNameToText(ts, el.propertyName)
          : el.name.text;
        out.push({ specifier: spec, importName });
      }
    }
  }

  return out;
};

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

    const out: DefiningExport[] = [];

    if (
      sourceFileDefinesExportName({
        ts,
        sourceFile,
        exportName,
        localNames,
      })
    ) {
      out.push({ absPath: sourceFile.fileName, exportName });
    }

    // Follow re-export forwarding edges for this name.
    const targets = collectReexportTargetsForName({
      ts,
      sourceFile,
      exportName,
    });
    for (const t of targets) {
      const abs = resolveAbsPath(sourceFile.fileName, t.specifier);
      if (!abs) continue;
      const nextSf = getSourceFile(abs);
      if (!nextSf) continue;
      out.push(...visit(nextSf, t.importName, stack));
    }

    const uniq = uniqByKey(out, (d) => `${d.absPath}\0${d.exportName}`);
    cache.memo.set(key, uniq);
    stack.delete(key);
    return uniq;
  };

  return visit(entrySourceFile, args.exportName, new Set<string>());
};
