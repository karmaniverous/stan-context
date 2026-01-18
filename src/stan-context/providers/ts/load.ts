/**
 * Requirements addressed:
 * - TypeScript is a peer dependency with graceful degradation when missing.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Attempt to load TypeScript without using dynamic `import()`.
 *
 * This uses `require()` via `createRequire` specifically because TypeScript is an
 * optional peer dependency and this package must degrade gracefully when it is
 * not installed.
 */
export const tryLoadTypeScript = (): typeof import('typescript') | null => {
  try {
    return require('typescript') as typeof import('typescript');
  } catch {
    return null;
  }
};
