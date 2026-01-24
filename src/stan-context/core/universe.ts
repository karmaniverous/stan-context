import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import ignore from 'ignore';
import picomatch from 'picomatch';

import { toPosixPath } from './paths';

/**
 * Requirements addressed:
 * - Universe scan defines source nodes.
 * - Respect root .gitignore (unless re-included via includes).
 * - Implicit exclusions: .git/** always; node_modules/** unless explicitly allowed.
 * - Precedence: includes =\> excludes.
 */
export type UniverseConfig = {
  includes?: string[];
  excludes?: string[];
};

const uniqSorted = (items: Iterable<string>): string[] =>
  Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));

const makeGlobMatcher = (
  patterns: string[] | undefined,
): ((p: string) => boolean) => {
  const pats = (patterns ?? []).filter(Boolean);
  if (!pats.length) return () => false;
  const isMatch = picomatch(pats, { dot: true });
  return (p: string) => isMatch(p);
};

const loadRootGitignore = async (cwd: string) => {
  const ig = ignore();
  try {
    const body = await fs.readFile(path.join(cwd, '.gitignore'), 'utf8');
    ig.add(body);
  } catch {
    // absent or unreadable .gitignore is acceptable
  }
  return ig;
};

export const scanUniverseFiles = async (args: {
  cwd: string;
  config?: UniverseConfig;
}): Promise<string[]> => {
  const { cwd } = args;
  const cfg = args.config ?? {};

  const includes = (cfg.includes ?? []).map(toPosixPath);
  const excludes = (cfg.excludes ?? []).map(toPosixPath);

  const matchInclude = makeGlobMatcher(includes);
  const matchExclude = makeGlobMatcher(excludes);

  const ig = await loadRootGitignore(cwd);

  // Avoid scanning huge trees by default. Explicit includes can add them back.
  const baseFiles = await fg('**/*', {
    cwd,
    dot: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: true,
    ignore: ['.git/**', 'node_modules/**'],
  });

  // Explicitly included globs (may include node_modules/**).
  const extraGlobs = uniqSorted(includes).filter((g) => g && g !== '**/*');
  const extraFiles =
    extraGlobs.length > 0
      ? await fg(extraGlobs, {
          cwd,
          dot: true,
          onlyFiles: true,
          unique: true,
          followSymbolicLinks: true,
          ignore: ['.git/**'],
        })
      : [];

  const candidates = uniqSorted([
    ...baseFiles.map(toPosixPath),
    ...extraFiles.map(toPosixPath),
  ]);

  const out: string[] = [];
  for (const p of candidates) {
    // Hard exclusion: .git is never allowed.
    if (p === '.git' || p.startsWith('.git/')) continue;

    const explicitAllow = matchInclude(p);
    const implicitNodeModulesDeny =
      (p === 'node_modules' || p.startsWith('node_modules/')) && !explicitAllow;
    if (implicitNodeModulesDeny) continue;

    let included = false;

    // Baseline allow: not gitignored and not implicitly denied.
    if (!ig.ignores(p)) included = true;

    // includes override gitignore
    if (matchInclude(p)) included = true;

    // excludes override includes
    if (matchExclude(p)) included = false;

    if (included) out.push(p);
  }

  return uniqSorted(out);
};
