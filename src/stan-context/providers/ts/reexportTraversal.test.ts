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

    expect(res).toEqual([
      { kind: 'symbol', absPath: user.fileName, exportName: 'User' },
    ]);
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

    expect(res).toEqual([
      { kind: 'symbol', absPath: a.fileName, exportName: 'A' },
    ]);
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

    expect(res).toEqual([
      { kind: 'symbol', absPath: a.fileName, exportName: 'A' },
    ]);
  });

  test('treats export default function/class as defining default', () => {
    const aFn = sf(
      '/repo/a-fn.ts',
      `export default function () { return 1 }\n`,
    );
    const aClass = sf('/repo/a-class.ts', `export default class X {}\n`);

    expect(
      resolveDefiningExportsForName({
        ts,
        entrySourceFile: aFn,
        exportName: 'default',
        resolveAbsPath: () => null,
        getSourceFile: () => undefined,
        cache: createReexportTraversalCache(),
      }),
    ).toEqual([
      { kind: 'symbol', absPath: aFn.fileName, exportName: 'default' },
    ]);

    expect(
      resolveDefiningExportsForName({
        ts,
        entrySourceFile: aClass,
        exportName: 'default',
        resolveAbsPath: () => null,
        getSourceFile: () => undefined,
        cache: createReexportTraversalCache(),
      }),
    ).toEqual([
      { kind: 'symbol', absPath: aClass.fileName, exportName: 'default' },
    ]);
  });

  test('follows import->export forwarding (named)', () => {
    const index = sf(
      '/repo/index.ts',
      `import { A as B } from './a';\nexport { B as C };\n`,
    );
    const a = sf('/repo/a.ts', `export const A = 1;\n`);

    const files = new Map<string, ts.SourceFile>([
      [index.fileName, index],
      [a.fileName, a],
    ]);

    const res = resolveDefiningExportsForName({
      ts,
      entrySourceFile: index,
      exportName: 'C',
      resolveAbsPath: (fromAbs, spec) => {
        if (fromAbs === index.fileName && spec === './a') return a.fileName;
        return null;
      },
      getSourceFile: (abs) => files.get(abs),
      cache: createReexportTraversalCache(),
    });

    expect(res).toEqual([
      { kind: 'symbol', absPath: a.fileName, exportName: 'A' },
    ]);
  });

  test('follows import->export forwarding (default)', () => {
    const index = sf(
      '/repo/index.ts',
      `import Foo from './a';\nexport { Foo as Bar };\n`,
    );
    const a = sf('/repo/a.ts', `export default class Foo {}\n`);

    const files = new Map<string, ts.SourceFile>([
      [index.fileName, index],
      [a.fileName, a],
    ]);

    const res = resolveDefiningExportsForName({
      ts,
      entrySourceFile: index,
      exportName: 'Bar',
      resolveAbsPath: (fromAbs, spec) => {
        if (fromAbs === index.fileName && spec === './a') return a.fileName;
        return null;
      },
      getSourceFile: (abs) => files.get(abs),
      cache: createReexportTraversalCache(),
    });

    expect(res).toEqual([
      { kind: 'symbol', absPath: a.fileName, exportName: 'default' },
    ]);
  });

  test('treats namespace forwarding as a module-level target', () => {
    const index = sf(
      '/repo/index.ts',
      `import * as Ns from './a';\nexport { Ns as NamedNs };\n`,
    );
    const a = sf('/repo/a.ts', `export const A = 1;\n`);

    const files = new Map<string, ts.SourceFile>([
      [index.fileName, index],
      [a.fileName, a],
    ]);

    const res = resolveDefiningExportsForName({
      ts,
      entrySourceFile: index,
      exportName: 'NamedNs',
      resolveAbsPath: (fromAbs, spec) => {
        if (fromAbs === index.fileName && spec === './a') return a.fileName;
        return null;
      },
      getSourceFile: (abs) => files.get(abs),
      cache: createReexportTraversalCache(),
    });

    expect(res).toEqual([{ kind: 'module', absPath: a.fileName }]);
  });

  test('treats export * as Ns from as a module-level target', () => {
    const index = sf('/repo/index.ts', `export * as Ns from './a';\n`);
    const a = sf('/repo/a.ts', `export const A = 1;\n`);

    const files = new Map<string, ts.SourceFile>([
      [index.fileName, index],
      [a.fileName, a],
    ]);

    const res = resolveDefiningExportsForName({
      ts,
      entrySourceFile: index,
      exportName: 'Ns',
      resolveAbsPath: (fromAbs, spec) => {
        if (fromAbs === index.fileName && spec === './a') return a.fileName;
        return null;
      },
      getSourceFile: (abs) => files.get(abs),
      cache: createReexportTraversalCache(),
    });

    expect(res).toEqual([{ kind: 'module', absPath: a.fileName }]);
  });
});
