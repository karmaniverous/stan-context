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

const isTypeOnlySpecifier = (
  ts: typeof import('typescript'),
  el: import('typescript').ImportSpecifier,
): boolean => {
  const phase = (
    el as unknown as { phaseModifier?: import('typescript').SyntaxKind }
  ).phaseModifier;
  if (phase === ts.SyntaxKind.TypeKeyword) return true;

  const rec = el as unknown as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rec, 'isTypeOnly')) return false;
  return rec['isTypeOnly'] === true;
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
  if (clause.isTypeOnly) return 'type';
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    const allTypeOnly = clause.namedBindings.elements.every((e) =>
      isTypeOnlySpecifier(ts, e),
    );
    if (allTypeOnly && !clause.name) return 'type';
  }
  return 'runtime';
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

      const identifiers: import('typescript').Identifier[] = [];
      if (clause.name) identifiers.push(clause.name);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          // For "import { type X }", tunnel as type-only for this identifier.
          const elKind: GraphEdgeKind = isTypeOnlySpecifier(ts, el)
            ? 'type'
            : kind;
          tunnels.push({
            specifier: spec,
            kind: elKind,
            identifiers: [el.name],
          });
        }
      }

      if (identifiers.length)
        tunnels.push({ specifier: spec, kind, identifiers });
    }

    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      if (!isStringLiteralLike(ts, stmt.moduleSpecifier)) continue;
      const kind: GraphEdgeKind = stmt.isTypeOnly ? 'type' : 'runtime';
      explicit.push({ specifier: stmt.moduleSpecifier.text, kind });
    }

    if (ts.isImportEqualsDeclaration(stmt)) {
      const ref = stmt.moduleReference;
      if (ts.isExternalModuleReference(ref) && ref.expression) {
        if (!isStringLiteralLike(ts, ref.expression)) continue;
        explicit.push({ specifier: ref.expression.text, kind: 'runtime' });
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
        const [arg] = n.arguments;
        if (arg && isStringLiteralLike(ts, arg)) {
          explicit.push({ specifier: arg.text, kind: 'dynamic' });
        }
      }

      // require('x')
      if (ts.isIdentifier(n.expression) && n.expression.text === 'require') {
        const [arg] = n.arguments;
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
