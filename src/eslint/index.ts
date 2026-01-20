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

const plugin = { rules };
export default plugin;
