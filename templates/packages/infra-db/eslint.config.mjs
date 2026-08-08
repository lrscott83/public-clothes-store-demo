import { config as baseConfig } from '@store-mgmt/eslint-config/base';
import { domainBoundaryRule, tenantRepoBoundaryRule } from '@store-mgmt/eslint-config/backend-boundaries';

export default [
  ...baseConfig,
  domainBoundaryRule,
  tenantRepoBoundaryRule,
  { ignores: ['eslint.config.mjs', 'dist/**', 'generated/**'] },
];
