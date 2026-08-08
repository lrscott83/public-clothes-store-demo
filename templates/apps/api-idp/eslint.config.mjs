import { config as baseConfig } from '@store-mgmt/eslint-config/base';

export default [
  ...baseConfig,
  {
    languageOptions: {
      sourceType: 'module',
    },
  },
  { ignores: ['eslint.config.mjs', 'dist/**'] },
];
