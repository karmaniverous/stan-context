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
      'stan-context/require-module-description': 'warn',
    },
  },
};

const plugin = { rules, configs };
export default plugin;
