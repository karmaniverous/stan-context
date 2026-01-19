import ts from 'typescript';

import {
  createReexportTraversalCache,
  resolveDefiningExportsForName,
} from './reexportTraversal';

const sf = (fileName: string, body: string): ts.SourceFile =>
  ts.createSourceFile(fileName, body, ts.ScriptTarget.ES2022, true);

describe('reexportTraversal (AST-first)', () => {
  test('follows named re-export to defining module', () => {
    const index = sf(
      '/repo/models/index.ts',
      `export type { User } from './user';\n`,
    );
    const user = sf(
      '/repo/models/user.ts',
      `export type User = { id: string };\n`,
    );

    const files = new Map<string, ts.SourceFile>([
      [index.fileName, index],
      [user.fileName, user],
    ]);

    const res = resolveDefiningExportsForName({
      ts,
      entrySourceFile: index,
      exportName: 'User',
      resolveAbsPath: (fromAbs, spec) => {
        if (fromAbs === index.fileName && spec === './user')
          return user.fileName;
        return null;
      },
      getSourceFile: (abs) => files.get(abs),
      cache: createReexportTraversalCache(),
    });

    expect(res).toEqual([{ absPath: user.fileName, exportName: 'User' }]);
  });

  test('handles renamed re-export (export { A as B } from)', () => {
    const index = sf('/repo/index.ts', `export { A as B } from './a';\n`);
    const a = sf('/repo/a.ts', `export const A = 1;\n`);

    const files = new Map<string, ts.SourceFile>([
      [index.fileName, index],
      [a.fileName, a],
    ]);

    const res = resolveDefiningExportsForName({
      ts,
      entrySourceFile: index,
      exportName: 'B',
      resolveAbsPath: (fromAbs, spec) => {
        if (fromAbs === index.fileName && spec === './a') return a.fileName;
        return null;
      },
      getSourceFile: (abs) => files.get(abs),
      cache: createReexportTraversalCache(),
    });

    expect(res).toEqual([{ absPath: a.fileName, exportName: 'A' }]);
  });

  test('follows star re-export when it can define the name', () => {
    const index = sf('/repo/index.ts', `export * from './a';\n`);
    const a = sf('/repo/a.ts', `export interface A { a: string }\n`);

    const files = new Map<string, ts.SourceFile>([
      [index.fileName, index],
      [a.fileName, a],
    ]);

    const res = resolveDefiningExportsForName({
      ts,
      entrySourceFile: index,
      exportName: 'A',
      resolveAbsPath: (fromAbs, spec) => {
        if (fromAbs === index.fileName && spec === './a') return a.fileName;
        return null;
      },
      getSourceFile: (abs) => files.get(abs),
      cache: createReexportTraversalCache(),
    });

    expect(res).toEqual([{ absPath: a.fileName, exportName: 'A' }]);
  });
});
