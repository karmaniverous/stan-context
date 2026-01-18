/**
 * Requirements addressed:
 * - Use tsconfig.json only for compilerOptions (resolution settings).
 * - Do not rely on tsconfig include/exclude for selecting files.
 */

import path from 'node:path';

export const loadCompilerOptions = (args: {
  ts: typeof import('typescript');
  cwd: string;
}): import('typescript').CompilerOptions => {
  const { ts, cwd } = args;

  const defaultOptions: import('typescript').CompilerOptions = {
    allowJs: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node16,
  };

  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) return defaultOptions;

  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return defaultOptions;

  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );

  return { ...defaultOptions, ...parsed.options };
};
