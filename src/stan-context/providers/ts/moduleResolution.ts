import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const builtin = new Set<string>([
  ...builtinModules,
  ...builtinModules.map((m) => (m.startsWith('node:') ? m : `node:${m}`)),
]);

export type ResolvedModule =
  | { kind: 'builtin'; id: `node:${string}` }
  | { kind: 'missing'; id: string }
  | {
      kind: 'file';
      absPath: string;
      isExternalLibraryImport: boolean;
    };

const toNodeBuiltinId = (spec: string): `node:${string}` => {
  if (spec.startsWith('node:')) return spec as `node:${string}`;
  return `node:${spec}`;
};

const isNodeBuiltin = (spec: string): boolean =>
  builtin.has(spec) || builtin.has(`node:${spec}`);

const host: import('typescript').ModuleResolutionHost = {
  fileExists: (p) => fs.existsSync(p),
  readFile: (p) => fs.readFileSync(p, 'utf8'),
  directoryExists: (p) => fs.existsSync(p) && fs.statSync(p).isDirectory(),
  getCurrentDirectory: () => process.cwd(),
  getDirectories: (p) =>
    fs
      .readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(p, d.name)),
  realpath: (p) => fs.realpathSync(p),
};

export const resolveModuleSpecifier = (args: {
  ts: typeof import('typescript');
  fromAbsPath: string;
  specifier: string;
  compilerOptions: import('typescript').CompilerOptions;
}): ResolvedModule => {
  const { ts, specifier } = args;

  if (isNodeBuiltin(specifier)) {
    return { kind: 'builtin', id: toNodeBuiltinId(specifier) };
  }

  const res = ts.resolveModuleName(
    specifier,
    args.fromAbsPath,
    args.compilerOptions,
    host,
  );

  const resolved = res.resolvedModule;
  if (!resolved?.resolvedFileName) return { kind: 'missing', id: specifier };

  return {
    kind: 'file',
    absPath: resolved.resolvedFileName,
    isExternalLibraryImport: resolved.isExternalLibraryImport === true,
  };
};
