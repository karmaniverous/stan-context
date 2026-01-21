/**
 * Requirements addressed:
 * - Re-export traversal is an AST-first forwarding graph:
 *   - `export { X } from './x'`, `export type { X } from './x'`, `export * from`
 * - Additional forwarding forms must be supported:
 *   - `import ... from './x'; export { ... };`
 *   - namespace forwarding resolves to a module-level target.
 */

import type * as tsLib from 'typescript';

import { isStringLiteralLike, moduleExportNameToText } from './ast';
import type { ImportedBinding } from './importBindings';

export type ForwardTarget =
  | { kind: 'symbol'; specifier: string; importName: string }
  | { kind: 'module'; specifier: string };

export const collectForwardingTargetsForName = (args: {
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
