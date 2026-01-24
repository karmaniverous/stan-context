import { withTempDir, writeFile } from '../../test/temp';
import { scanUniverseFiles } from './universe';

describe('scanUniverseFiles', () => {
  test('respects .gitignore, includes, and excludes', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(
        cwd,
        '.gitignore',
        ['ignored.txt', 'node_modules/**'].join('\n'),
      );
      await writeFile(cwd, 'kept.txt', 'ok\n');
      await writeFile(cwd, 'ignored.txt', 'ignored\n');
      await writeFile(cwd, 'drop.txt', 'drop\n');
      await writeFile(cwd, 'excluded.txt', 'excluded\n');
      await writeFile(cwd, 'node_modules/pkg/index.d.ts', 'export {};\n');
      await writeFile(cwd, '.git/config', 'nope\n');

      const files = await scanUniverseFiles({
        cwd,
        config: {
          includes: ['ignored.txt', 'node_modules/pkg/**'],
          excludes: ['drop.txt', 'excluded.txt'],
        },
      });

      // baseline kept
      expect(files).toContain('kept.txt');

      // include overrides gitignore
      expect(files).toContain('ignored.txt');

      // excluded dropped
      expect(files).not.toContain('drop.txt');
      expect(files).not.toContain('excluded.txt');

      // node_modules is implicitly excluded unless explicitly included/anchored
      expect(files).toContain('node_modules/pkg/index.d.ts');

      // .git is hard excluded even if present on disk
      expect(files.some((p) => p.startsWith('.git/'))).toBe(false);
    });
  });
});
