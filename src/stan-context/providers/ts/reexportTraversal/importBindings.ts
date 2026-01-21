/**
 * Requirements addressed:
 * - Re-export traversal MUST support “import then export” forwarding:
 *   - named forwarding (`import { A as B } ...; export { B as C }`)
 *   - default forwarding (`import Foo ...; export { Foo as Bar }`)
 *   - namespace forwarding (`import * as Ns ...; export { Ns as NamedNs }`)
 */

import type * as tsLib from 'typescript';

import { isStringLiteralLike, moduleExportNameToText } from './ast';

export type ImportedBinding =
  | { kind: 'named'; specifier: string; importName: string }
  | { kind: 'default'; specifier: string }
  | { kind: 'namespace'; specifier: string };

export const collectImportBindings = (args: {
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
