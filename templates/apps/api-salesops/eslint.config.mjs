import { config as baseConfig } from '@store-mgmt/eslint-config/base';
import { salesForbidsDeliveryImportRule } from '@store-mgmt/eslint-config/backend-boundaries';

export default [
  ...baseConfig,
  salesForbidsDeliveryImportRule,
  {
    languageOptions: {
      sourceType: 'module',
    },
  },
  { ignores: ['eslint.config.mjs', 'dist/**'] },
];
