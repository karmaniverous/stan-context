import { createRequire } from 'node:module';

import ts from 'typescript';

import { withTempDir, writeFile } from '../test/temp';
import { generateDependencyGraph } from './generateDependencyGraph';
import type { DependencyGraph } from './types';

describe('generateDependencyGraph', () => {
  test('throws when TypeScript is not provided', async () => {
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

      await expect(generateDependencyGraph({ cwd })).rejects.toThrow(
        /TypeScript is required: pass opts\.typescript or opts\.typescriptPath/i,
      );
    });
  });

  test('accepts typescriptPath injection', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(cwd, 'a.ts', `export const x = 1;\n`);

      const require = createRequire(import.meta.url);
      const typescriptPath = require.resolve('typescript');

      const res = await generateDependencyGraph({ cwd, typescriptPath });
      expect(res.graph.nodes['a.ts']).toBeTruthy();
      expect(res.graph.edges['a.ts']).toEqual([]);
    });
  });

  test('hashSizeEnforcement=warn surfaces warning for carried nodes', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(cwd, 'a.ts', `export const a = 1;\n`);

      // First build: capture a correct, hashed source node for a.ts.
      const built = await generateDependencyGraph({ cwd, typescript: ts });
      const aNode = built.graph.nodes['a.ts'];
      expect(aNode).toBeTruthy();

      // Construct a previousGraph that references a carried external node with
      // `metadata.hash` but missing `metadata.size`.
      const extId = 'external.d.ts';
      const previousGraph: DependencyGraph = {
        nodes: {
          'a.ts': aNode,
          [extId]: {
            id: extId,
            kind: 'external',
            language: 'ts',
            metadata: { hash: 'hx' },
          },
        },
        edges: {
          'a.ts': [{ target: extId, kind: 'runtime', resolution: 'explicit' }],
          [extId]: [],
        },
      };

      const res = await generateDependencyGraph({
        cwd,
        typescript: ts,
        previousGraph,
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
      await writeFile(cwd, 'a.ts', `export const a = 1;\n`);

      const built = await generateDependencyGraph({ cwd, typescript: ts });
      const aNode = built.graph.nodes['a.ts'];
      expect(aNode).toBeTruthy();

      const extId = 'external.d.ts';
      const previousGraph: DependencyGraph = {
        nodes: {
          'a.ts': aNode,
          [extId]: {
            id: extId,
            kind: 'external',
            language: 'ts',
            metadata: { hash: 'hx' },
          },
        },
        edges: {
          'a.ts': [{ target: extId, kind: 'runtime', resolution: 'explicit' }],
          [extId]: [],
        },
      };

      await expect(
        generateDependencyGraph({
          cwd,
          typescript: ts,
          previousGraph,
          hashSizeEnforcement: 'error',
        }),
      ).rejects.toThrow(/metadata\.size missing for hashed nodes/);
    });
  });
});
