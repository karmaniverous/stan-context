/**
 * Requirements addressed:
 * - TypeScript is required for TS/JS analysis and MUST be provided explicitly
 *   by the host (module injection or absolute entry-path injection).
 * - No implicit/ambient `require('typescript')` fallback.
 * - Error messages must be actionable and include underlying load failures.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Attempt to load TypeScript without using dynamic `import()`.
 *
 * This uses `require()` via `createRequire` to keep behavior stable across
 * bundlers and to support loading from an explicit absolute path.
 */
type TsModule = typeof import('typescript');

const isTsModule = (m: unknown): m is TsModule => {
  const any = m as Record<string, unknown> | null;
  if (!any || typeof any !== 'object') return false;
  // Minimal runtime shape check for the API surface we rely on.
  return (
    typeof any.createProgram === 'function' &&
    typeof any.resolveModuleName === 'function'
  );
};

const unwrapTsModule = (m: unknown): TsModule | null => {
  if (isTsModule(m)) return m;
  const any = m as { default?: unknown } | null;
  if (any && isTsModule(any.default)) return any.default;
  return null;
};

export const loadTypeScript = (args: {
  typescript?: TsModule;
  typescriptPath?: string;
}): TsModule => {
  // Highest priority: explicit module injection.
  if (args.typescript !== undefined) {
    const unwrapped = unwrapTsModule(args.typescript);
    if (unwrapped) return unwrapped;
    throw new Error(
      'Invalid opts.typescript: expected a TypeScript module instance (missing createProgram/resolveModuleName).',
    );
  }

  // Next: explicit path injection.
  if (typeof args.typescriptPath === 'string' && args.typescriptPath.trim()) {
    const p = args.typescriptPath.trim();
    if (!path.isAbsolute(p)) {
      throw new Error(
        `Invalid opts.typescriptPath: must be an absolute path: ${p}`,
      );
    }

    try {
      const loaded = require(p) as unknown;
      const unwrapped = unwrapTsModule(loaded);
      if (unwrapped) return unwrapped;
      throw new Error(
        `Loaded module from opts.typescriptPath but it does not look like TypeScript (missing createProgram/resolveModuleName): ${p}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to load TypeScript from opts.typescriptPath (${p}): ${msg}`,
        { cause: err },
      );
    }
  }

  // No implicit fallback: the host must be explicit.
  throw new Error(
    'TypeScript is required: pass opts.typescript or opts.typescriptPath.',
  );
};
