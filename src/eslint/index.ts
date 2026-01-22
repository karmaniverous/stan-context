/**
 * Requirements addressed:
 * - ESLint recommended config should not require module prose docs in test and
 *   test-like files (e.g., *.test.*, *.spec.*, and common test directories),
 *   across TS/JS-like extensions.
 */

/**
 * ESLint plugin exports for `@karmaniverous/stan-context`.
 *
 * Intended import:
 * - `import plugin from '@karmaniverous/stan-context/eslint'`
 */

import { requireModuleDescriptionRule } from './rules/require-module-description';

export const rules = {
  'require-module-description': requireModuleDescriptionRule,
};

export const configs = {
  recommended: {
    rules: {
      'stan-context/require-module-description': [
        'warn',
        {
          ignorePatterns: [
            // Suffix-based test conventions.
            '**/*.{test,spec,e2e,integration}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
            // Folder-based test conventions.
            '**/{test,tests,__tests__}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
          ],
        },
      ],
    },
  },
};

const plugin = { rules, configs };
export default plugin;
