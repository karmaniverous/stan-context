import { withTempDir, writeFile } from '../test/temp';
import { generateDependencyGraph } from './generateDependencyGraph';

vi.mock('./providers/ts/load', () => {
  return {
    loadTypeScript: async () => {
      throw new Error('typescript not installed');
    },
  };
});

describe('generateDependencyGraph', () => {
  test('returns nodes-only graph when TypeScript is missing', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(cwd, 'a.ts', 'export const x = 1;\n');

      const res = await generateDependencyGraph({ cwd });

      expect(res.errors.join('\n')).toContain(
        'typescript peer dependency not found',
      );
      expect(res.graph.nodes['a.ts']).toBeTruthy();
      expect(res.graph.edges['a.ts']).toEqual([]);

      // edges map must be complete: key for every node
      for (const id of Object.keys(res.graph.nodes)) {
        expect(res.graph.edges[id]).toBeTruthy();
      }
    });
  });
});
