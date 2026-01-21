/**
 * Requirements addressed:
 * - Keep re-export traversal AST-first and SRP-friendly by factoring small,
 *   reusable AST helpers into a leaf module.
 */

import type * as tsLib from 'typescript';

export const isStringLiteralLike = (
  ts: typeof tsLib,
  n: tsLib.Node,
): n is tsLib.StringLiteralLike =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

export const moduleExportNameToText = (
  ts: typeof tsLib,
  n: tsLib.ModuleExportName,
): string => {
  // ModuleExportName is Identifier | StringLiteral.
  return ts.isIdentifier(n) ? n.text : n.text;
};

export const hasModifierKind = (
  ts: typeof tsLib,
  n: tsLib.Node,
  kind: tsLib.SyntaxKind,
): boolean => {
  if (!ts.canHaveModifiers(n)) return false;
  const mods = ts.getModifiers(n);
  return mods?.some((m) => m.kind === kind) ?? false;
};

export const hasExportModifier = (ts: typeof tsLib, n: tsLib.Node): boolean =>
  hasModifierKind(ts, n, ts.SyntaxKind.ExportKeyword);
