import { withTempDir, writeFile } from '../test/temp';
import type { DependencyGraph } from './types';

const loadGenerateDependencyGraphWithMissingTs = async () => {
  vi.resetModules();
  vi.doMock('./providers/ts/load', () => {
    return { tryLoadTypeScript: () => null };
  });
  const mod = await import('./generateDependencyGraph');
  return mod.generateDependencyGraph;
};

const cleanupTsLoaderMock = () => {
  vi.resetModules();
  vi.unmock('./providers/ts/load');
};

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

      const generateDependencyGraph =
        await loadGenerateDependencyGraphWithMissingTs();

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

      cleanupTsLoaderMock();
    });
  });

  test('hashSizeEnforcement=warn surfaces warning for carried nodes', async () => {
    await withTempDir(async (cwd) => {
      const generateDependencyGraph =
        await loadGenerateDependencyGraphWithMissingTs();

      await writeFile(cwd, 'a.ts', `export const a = 1;\n`);

      // First build: capture a correct, hashed source node for a.ts.
      const built = await generateDependencyGraph({ cwd });
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
        previousGraph,
        hashSizeEnforcement: 'warn',
      });

      expect(
        res.errors.some((e) =>
          e.includes(`warning: metadata.size missing for hashed node ${extId}`),
        ),
      ).toBe(true);

      cleanupTsLoaderMock();
    });
  });

  test('hashSizeEnforcement=error throws on violation', async () => {
    await withTempDir(async (cwd) => {
      const generateDependencyGraph =
        await loadGenerateDependencyGraphWithMissingTs();

      await writeFile(cwd, 'a.ts', `export const a = 1;\n`);

      const built = await generateDependencyGraph({ cwd });
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
          previousGraph,
          hashSizeEnforcement: 'error',
        }),
      ).rejects.toThrow(/metadata\.size missing for hashed nodes/);

      cleanupTsLoaderMock();
    });
  });
});
