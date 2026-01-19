/** See <stanPath>/system/stan.project.md for global requirements. */
import aliasPlugin, { type Alias } from '@rollup/plugin-alias';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terserPlugin from '@rollup/plugin-terser';
import typescriptPlugin from '@rollup/plugin-typescript';
import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import type {
  InputOptions,
  OutputOptions,
  Plugin,
  RollupOptions,
} from 'rollup';
import dtsPlugin from 'rollup-plugin-dts';

const outputPath = 'dist';

// Path alias @ -> <abs>/src (absolute to avoid module duplication warnings in Rollup)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcAbs = path.resolve(__dirname, 'src');
const aliases: Alias[] = [{ find: '@', replacement: srcAbs }];
const alias = aliasPlugin({ entries: aliases });

// Treat Node built-ins and node: specifiers as external.
const nodeExternals = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

// Runtime + peer deps to keep external (library build).
const externalPkgs = new Set<string>([
  'fast-glob',
  'glob-parent',
  'ignore',
  'picomatch',
  'typescript',
]);

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const copyDocsPlugin = (dest: string): Plugin => {
  return {
    name: 'stan-copy-docs',
    async writeBundle() {
      const fromSystem = path.resolve(__dirname, '.stan', 'system');
      const candidates = [
        {
          src: path.join(fromSystem, 'stan.system.md'),
          dest: path.join(dest, 'stan.system.md'),
        },
      ];
      try {
        await mkdir(dest, { recursive: true });
        for (const c of candidates) {
          if (await pathExists(c.src)) await copyFile(c.src, c.dest);
        }
      } catch {
        // best-effort
      }
    },
  };
};

const makePlugins = (minify: boolean, extras: Plugin[] = []): Plugin[] => {
  const base: Plugin[] = [
    alias,
    nodeResolve({ exportConditions: ['node', 'module', 'default'] }),
    jsonPlugin(),
    typescriptPlugin(),
    ...extras,
  ];
  return minify
    ? [...base, terserPlugin({ format: { comments: false } })]
    : base;
};

const commonInputOptions = (
  minify: boolean,
  extras: Plugin[] = [],
): InputOptions => ({
  plugins: makePlugins(minify, extras),
  onwarn(warning, defaultHandler) {
    defaultHandler(warning);
  },
  external: (id) =>
    nodeExternals.has(id) ||
    externalPkgs.has(id) ||
    // also treat deep subpath imports as external (e.g., clipboardy/fallbacks/...)
    Array.from(externalPkgs).some((p) => id === p || id.startsWith(`${p}/`)),
});

const outEsmOnly = (dest: string): OutputOptions[] => [
  { dir: `${dest}/mjs`, format: 'esm', sourcemap: false },
];
export const buildLibrary = (dest: string): RollupOptions => ({
  input: 'src/index.ts',
  output: outEsmOnly(dest),
  ...commonInputOptions(
    true,
    // Copy docs once from library config
    [copyDocsPlugin(dest)],
  ),
});

export const buildTypes = (dest: string): RollupOptions => ({
  input: 'src/index.ts',
  output: [{ dir: `${dest}/types`, format: 'esm' }],
  // Ensure alias resolution works during type bundling to avoid unresolved "@/..." warnings.
  plugins: [alias, dtsPlugin()],
});

export default [buildLibrary(outputPath), buildTypes(outputPath)];
