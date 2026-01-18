import { withTempDir, writeFile } from '../../../test/temp';

const loadGenerateDependencyGraph = async () => {
  vi.resetModules();
  const mod = await import('../../generateDependencyGraph');
  return mod.generateDependencyGraph;
};

const targets = (
  graph: Awaited<
    ReturnType<Awaited<ReturnType<typeof loadGenerateDependencyGraph>>>
  >['graph'],
  from: string,
): string[] =>
  graph.edges[from].map((e) => `${e.resolution}:${e.kind}:${e.target}`);

describe('TypeScript provider (integration)', () => {
  test('barrel tunneling emits explicit + implicit edges for type imports', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(
        cwd,
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Node16',
              strict: true,
            },
          },
          null,
          2,
        ),
      );

      await writeFile(
        cwd,
        'models/user.ts',
        `export type User = { id: string };\n`,
      );
      await writeFile(
        cwd,
        'models/index.ts',
        `export type { User } from './user';\n`,
      );
      await writeFile(
        cwd,
        'feature.ts',
        `import type { User } from './models';\nexport const u: User = { id: '1' };\n`,
      );

      const generateDependencyGraph = await loadGenerateDependencyGraph();
      const res = await generateDependencyGraph({ cwd });
      const t = targets(res.graph, 'feature.ts');

      expect(t).toContain('explicit:type:models/index.ts');
      expect(t).toContain('implicit:type:models/user.ts');
    });
  });

  test('namespace imports do not tunnel', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(
        cwd,
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Node16',
            },
          },
          null,
          2,
        ),
      );

      await writeFile(cwd, 'a.ts', `export const x = 1;\n`);
      await writeFile(cwd, 'barrel.ts', `export * from './a';\n`);
      await writeFile(
        cwd,
        'use.ts',
        `import * as Ns from './barrel';\nvoid Ns;\n`,
      );

      const generateDependencyGraph = await loadGenerateDependencyGraph();
      const res = await generateDependencyGraph({ cwd });
      const t = targets(res.graph, 'use.ts');
      expect(t).toContain('explicit:runtime:barrel.ts');
      expect(
        t.some((x) => x.includes(':implicit:') || x.endsWith(':a.ts')),
      ).toBe(false);
    });
  });

  test('builtins normalize to node:fs and missing creates missing node id', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(
        cwd,
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Node16',
            },
          },
          null,
          2,
        ),
      );

      await writeFile(cwd, 'builtin.ts', `import fs from 'fs';\nvoid fs;\n`);
      await writeFile(cwd, 'miss.ts', `import x from './nope';\nvoid x;\n`);

      const generateDependencyGraph = await loadGenerateDependencyGraph();
      const res = await generateDependencyGraph({ cwd });

      expect(
        Object.prototype.hasOwnProperty.call(res.graph.nodes, 'node:fs'),
      ).toBe(true);
      expect(res.graph.nodes['node:fs'].kind).toBe('builtin');
      expect(targets(res.graph, 'builtin.ts')).toContain(
        'explicit:runtime:node:fs',
      );

      expect(
        Object.prototype.hasOwnProperty.call(res.graph.nodes, './nope'),
      ).toBe(true);
      expect(res.graph.nodes['./nope'].kind).toBe('missing');
      expect(targets(res.graph, 'miss.ts')).toContain(
        'explicit:runtime:./nope',
      );
    });
  });

  test('external commander rule tunnels only within package boundary', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(
        cwd,
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Node16',
            },
          },
          null,
          2,
        ),
      );

      await writeFile(
        cwd,
        'node_modules/pkg/package.json',
        JSON.stringify(
          { name: 'pkg', version: '1.0.0', types: 'index.d.ts' },
          null,
          2,
        ),
      );
      await writeFile(
        cwd,
        'node_modules/pkg/index.d.ts',
        `export { A } from './a';\nexport { B } from 'other';\n`,
      );
      await writeFile(
        cwd,
        'node_modules/pkg/a.d.ts',
        `export interface A { a: string }\n`,
      );

      await writeFile(
        cwd,
        'node_modules/other/package.json',
        JSON.stringify(
          { name: 'other', version: '1.0.0', types: 'index.d.ts' },
          null,
          2,
        ),
      );
      await writeFile(
        cwd,
        'node_modules/other/index.d.ts',
        `export interface B { b: string }\n`,
      );

      await writeFile(
        cwd,
        'usepkg.ts',
        `import { A, B } from 'pkg';\nexport const a: A = { a: 'x' };\nexport const b: B = { b: 'y' };\n`,
      );

      const generateDependencyGraph = await loadGenerateDependencyGraph();
      const res = await generateDependencyGraph({ cwd });
      const t = targets(res.graph, 'usepkg.ts');

      expect(t).toContain('explicit:runtime:node_modules/pkg/index.d.ts');
      expect(t).toContain('implicit:runtime:node_modules/pkg/a.d.ts');
      expect(t).not.toContain('implicit:runtime:node_modules/other/index.d.ts');
    });
  });
});
