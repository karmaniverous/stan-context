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

const hasModifierKind = (
  ts: typeof tsLib,
  n: tsLib.Node,
  kind: tsLib.SyntaxKind,
): boolean => {
  if (!ts.canHaveModifiers(n)) return false;
  const mods = ts.getModifiers(n);
  return mods?.some((m) => m.kind === kind) ?? false;
};

const hasExportModifier = (ts: typeof tsLib, n: tsLib.Node): boolean => {
  return hasModifierKind(ts, n, ts.SyntaxKind.ExportKeyword);
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

type ImportedBinding =
  | { kind: 'named'; specifier: string; importName: string }
  | { kind: 'default'; specifier: string }
  | { kind: 'namespace'; specifier: string };

const collectImportBindings = (args: {
  ts: typeof tsLib;
  sourceFile: tsLib.SourceFile;
}): Map<string, ImportedBinding> => {
  const { ts, sourceFile } = args;
  const out = new Map<string, ImportedBinding>();

  for (const s of sourceFile.statements) {
    if (!ts.isImportDeclaration(s)) continue;
    if (!s.importClause) continue;
    if (!isStringLiteralLike(ts, s.moduleSpecifier)) continue;
    const specifier = s.moduleSpecifier.text;

    // default import: import Foo from './x'
    if (s.importClause.name) {
      out.set(s.importClause.name.text, { kind: 'default', specifier });
    }

    const nb = s.importClause.namedBindings;
    if (!nb) continue;

    // namespace import: import * as Ns from './x'
    if (ts.isNamespaceImport(nb)) {
      out.set(nb.name.text, { kind: 'namespace', specifier });
      continue;
    }

    // named imports: import { A as B } from './x'
    if (ts.isNamedImports(nb)) {
      for (const el of nb.elements) {
        const local = el.name.text;
        const importName = el.propertyName
          ? moduleExportNameToText(ts, el.propertyName)
          : el.name.text;
        out.set(local, { kind: 'named', specifier, importName });
      }
    }
  }

  return out;
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
      if (
        ts.isFunctionDeclaration(s) &&
        hasExportModifier(ts, s) &&
        hasModifierKind(ts, s, ts.SyntaxKind.DefaultKeyword)
      )
        return true;
      if (
        ts.isClassDeclaration(s) &&
        hasExportModifier(ts, s) &&
        hasModifierKind(ts, s, ts.SyntaxKind.DefaultKeyword)
      )
        return true;
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

type ForwardTarget =
  | { kind: 'symbol'; specifier: string; importName: string }
  | { kind: 'module'; specifier: string };

const collectForwardingTargetsForName = (args: {
  ts: typeof tsLib;
  sourceFile: tsLib.SourceFile;
  exportName: string;
  localNames: Set<string>;
  imports: Map<string, ImportedBinding>;
}): ForwardTarget[] => {
  const { ts, sourceFile, exportName } = args;
  const out: ForwardTarget[] = [];

  for (const s of sourceFile.statements) {
    if (!ts.isExportDeclaration(s)) continue;

    // --- Case 1: export ... from './x' (moduleSpecifier present) ---
    if (s.moduleSpecifier && isStringLiteralLike(ts, s.moduleSpecifier)) {
      const spec = s.moduleSpecifier.text;

      // `export * from './x'`
      if (!s.exportClause) {
        out.push({ kind: 'symbol', specifier: spec, importName: exportName });
        continue;
      }

      // `export * as Ns from './x'` (namespace export)
      if (ts.isNamespaceExport(s.exportClause)) {
        if (s.exportClause.name.text === exportName) {
          out.push({ kind: 'module', specifier: spec });
        }
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
          out.push({ kind: 'symbol', specifier: spec, importName });
        }
      }

      continue;
    }

    // --- Case 2: export { X } (no moduleSpecifier; may forward imported bindings) ---
    if (!s.exportClause) continue;
    if (!ts.isNamedExports(s.exportClause)) continue;

    for (const el of s.exportClause.elements) {
      const exported = el.name.text;
      if (exported !== exportName) continue;

      const local = el.propertyName
        ? moduleExportNameToText(ts, el.propertyName)
        : el.name.text;
      if (args.localNames.has(local)) continue;

      const imp = args.imports.get(local);
      if (!imp) continue;

      if (imp.kind === 'namespace') {
        out.push({ kind: 'module', specifier: imp.specifier });
        continue;
      }

      const importName = imp.kind === 'default' ? 'default' : imp.importName;
      out.push({ kind: 'symbol', specifier: imp.specifier, importName });
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
