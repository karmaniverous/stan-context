/**
 * Requirements addressed:
 * - Re-export traversal needs a cheap AST-first way to distinguish “defined
 *   locally” vs “forwarded,” without involving the TypeChecker.
 */

import type * as tsLib from 'typescript';

export const collectLocalTopLevelDeclarationNames = (args: {
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
