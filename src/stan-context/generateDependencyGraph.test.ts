import { withTempDir, writeFile } from '../test/temp';
import type { DependencyGraph } from './types';

describe('generateDependencyGraph', () => {
  test('returns nodes-only graph when TypeScript is missing', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(
        cwd,
        'a.ts',
        [
          '/**',
          ' * @module',
          ' * This is the module summary.',
          ' */',
          'export const x = 1;',
          '',
        ].join('\n'),
      );

      vi.resetModules();
      vi.doMock('./providers/ts/load', () => {
        return { tryLoadTypeScript: () => null };
      });
      const { generateDependencyGraph } =
        await import('./generateDependencyGraph');

      const res = await generateDependencyGraph({ cwd });

      expect(res.errors.join('\n')).toContain(
        'typescript peer dependency not found',
      );
      expect(res.graph.nodes['a.ts']).toBeTruthy();
      expect(res.graph.edges['a.ts']).toEqual([]);
      expect(res.graph.nodes['a.ts'].description).toBe(
        'This is the module summary.',
      );

      // edges map must be complete: key for every node
      for (const id of Object.keys(res.graph.nodes)) {
        expect(res.graph.edges[id]).toBeTruthy();
      }

      vi.resetModules();
      vi.unmock('./providers/ts/load');
    });
  });

  test('hashSizeEnforcement=warn surfaces warning for carried nodes', async () => {
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
        `export interface A { a: string }\n`,
      );
      await writeFile(
        cwd,
        'use.ts',
        `import type { A } from 'pkg';\nexport const x: A = { a: 'x' };\n`,
      );

      const first = await import('./generateDependencyGraph');
      const built = await first.generateDependencyGraph({ cwd });
      const extId = 'node_modules/pkg/index.d.ts';

      expect(built.graph.nodes[extId]).toBeTruthy();
      expect(typeof built.graph.nodes[extId].metadata?.hash).toBe('string');
      expect(typeof built.graph.nodes[extId].metadata?.size).toBe('number');

      const mutated: DependencyGraph = JSON.parse(JSON.stringify(built.graph));
      // Simulate an older/hand-constructed previousGraph where size is missing
      // but hash is present (carried nodes path).
      delete mutated.nodes[extId].metadata?.size;

      const res = await first.generateDependencyGraph({
        cwd,
        previousGraph: mutated,
        hashSizeEnforcement: 'warn',
      });

      expect(
        res.errors.some((e) =>
          e.includes(`warning: metadata.size missing for hashed node ${extId}`),
        ),
      ).toBe(true);
    });
  });

  test('hashSizeEnforcement=error throws on violation', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(
        cwd,
        'node_modules/pkg/index.d.ts',
        `export interface A { a: string }\n`,
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
        'use.ts',
        `import type { A } from 'pkg';\nexport const x: A = { a: 'x' };\n`,
      );

      const mod = await import('./generateDependencyGraph');
      const built = await mod.generateDependencyGraph({ cwd });
      const extId = 'node_modules/pkg/index.d.ts';

      const mutated: DependencyGraph = JSON.parse(JSON.stringify(built.graph));
      delete mutated.nodes[extId].metadata?.size;

      await expect(
        mod.generateDependencyGraph({
          cwd,
          previousGraph: mutated,
          hashSizeEnforcement: 'error',
        }),
      ).rejects.toThrow(/metadata\.size missing for hashed nodes/);
    });
  });
});
