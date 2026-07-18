import { config as baseConfig } from '@store-mgmt/eslint-config/base';
import { domainBoundaryRule } from '@store-mgmt/eslint-config/backend-boundaries';

export default [
  ...baseConfig,
  domainBoundaryRule,
  { ignores: ['eslint.config.mjs', 'dist/**', 'generated/**'] },
];
