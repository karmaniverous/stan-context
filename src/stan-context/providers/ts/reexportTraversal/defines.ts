/**
 * Requirements addressed:
 * - Always chase until reaching a “true defining file”:
 *   a module that defines the requested export name locally (not merely
 *   forwarding it).
 * - Default export definitions count as defining `default`:
 *   - `export default <expr>` (export assignment)
 *   - `export default function ...` and `export default class ...`
 */

import type * as tsLib from 'typescript';

import {
  hasExportModifier,
  hasModifierKind,
  moduleExportNameToText,
} from './ast';

export const sourceFileDefinesExportName = (args: {
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
