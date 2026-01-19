import type { GraphEdgeKind } from '../../types';

export type ExplicitImport = {
  specifier: string;
  kind: GraphEdgeKind;
};

export type TunnelRequest = {
  specifier: string;
  kind: GraphEdgeKind;
  identifiers: import('typescript').Identifier[];
};

const isTypeOnlyImportSpecifier = (
  ts: typeof import('typescript'),
  el: import('typescript').ImportSpecifier,
): boolean => {
  const phase = (
    el as unknown as { phaseModifier?: import('typescript').SyntaxKind }
  ).phaseModifier;
  if (phase === ts.SyntaxKind.TypeKeyword) return true;

  return false;
};

const isTypeOnlyClause = (
  ts: typeof import('typescript'),
  clause: import('typescript').ImportClause,
): boolean => {
  const phase = (
    clause as unknown as { phaseModifier?: import('typescript').SyntaxKind }
  ).phaseModifier;
  return phase === ts.SyntaxKind.TypeKeyword;
};

const isStringLiteralLike = (
  ts: typeof import('typescript'),
  n: import('typescript').Node,
): n is import('typescript').StringLiteralLike =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

const classifyImportDeclarationKind = (
  ts: typeof import('typescript'),
  stmt: import('typescript').ImportDeclaration,
): GraphEdgeKind => {
  const clause = stmt.importClause;
  if (!clause) return 'runtime';
  if (isTypeOnlyClause(ts, clause)) return 'type';
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    const allTypeOnly = clause.namedBindings.elements.every((e) =>
      isTypeOnlyImportSpecifier(ts, e),
    );
    if (allTypeOnly && !clause.name) return 'type';
  }
  return 'runtime';
};

const isTypeOnlyExportDeclaration = (
  ts: typeof import('typescript'),
  stmt: import('typescript').ExportDeclaration,
): boolean => {
  const phase = (
    stmt as unknown as { phaseModifier?: import('typescript').SyntaxKind }
  ).phaseModifier;
  if (phase === ts.SyntaxKind.TypeKeyword) return true;

  const clause = stmt.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return false;
  return clause.elements.every((e) => {
    const p = (
      e as unknown as { phaseModifier?: import('typescript').SyntaxKind }
    ).phaseModifier;
    return p === ts.SyntaxKind.TypeKeyword;
  });
};

export const extractFromSourceFile = (args: {
  ts: typeof import('typescript');
  sourceFile: import('typescript').SourceFile;
}): { explicit: ExplicitImport[]; tunnels: TunnelRequest[] } => {
  const { ts, sourceFile } = args;

  const explicit: ExplicitImport[] = [];
  const tunnels: TunnelRequest[] = [];

  // Imports / exports with module specifiers.
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      if (!isStringLiteralLike(ts, stmt.moduleSpecifier)) continue;
      const spec = stmt.moduleSpecifier.text;
      const kind = classifyImportDeclarationKind(ts, stmt);
      explicit.push({ specifier: spec, kind });

      const clause = stmt.importClause;
      if (!clause) continue;
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        // Do not tunnel namespace imports.
        continue;
      }

      if (clause.name) {
        // Tunnel default import using the importer-side binding.
        tunnels.push({ specifier: spec, kind, identifiers: [clause.name] });
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const elIsTypeOnly = isTypeOnlyImportSpecifier(ts, el);
          const elKind: GraphEdgeKind =
            kind === 'type' ? 'type' : elIsTypeOnly ? 'type' : kind;
          tunnels.push({
            specifier: spec,
            kind: elKind,
            identifiers: [el.name],
          });
        }
      }
    }

    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      if (!isStringLiteralLike(ts, stmt.moduleSpecifier)) continue;
      const kind: GraphEdgeKind = isTypeOnlyExportDeclaration(ts, stmt)
        ? 'type'
        : 'runtime';
      explicit.push({ specifier: stmt.moduleSpecifier.text, kind });
    }

    if (ts.isImportEqualsDeclaration(stmt)) {
      const ref = stmt.moduleReference;
      if (ts.isExternalModuleReference(ref)) {
        const expr = ref.expression;
        if (!isStringLiteralLike(ts, expr)) continue;
        explicit.push({ specifier: expr.text, kind: 'runtime' });
      }
    }
  }

  // require() and import() expressions (scan with function-depth tracking).
  const walk = (n: import('typescript').Node, functionDepth: number) => {
    const nextDepth =
      ts.isFunctionLike(n) || ts.isMethodDeclaration(n)
        ? functionDepth + 1
        : functionDepth;

    if (ts.isCallExpression(n)) {
      // import('x')
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = n.arguments.at(0);
        if (arg && isStringLiteralLike(ts, arg)) {
          explicit.push({ specifier: arg.text, kind: 'dynamic' });
        }
      }

      // require('x')
      if (ts.isIdentifier(n.expression) && n.expression.text === 'require') {
        const arg = n.arguments.at(0);
        if (arg && isStringLiteralLike(ts, arg)) {
          explicit.push({
            specifier: arg.text,
            kind: functionDepth > 0 ? 'dynamic' : 'runtime',
          });
        }
      }
    }

    ts.forEachChild(n, (c) => {
      walk(c, nextDepth);
    });
  };

  walk(sourceFile, 0);

  return { explicit, tunnels };
};
