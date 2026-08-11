import config from '@store-mgmt/eslint-config/react-router';
import globals from 'globals';
import { webBackendBoundaryRule, frozenLegacyAppRule } from '@store-mgmt/eslint-config/backend-boundaries';

export default [
  ...config,
  { ignores: ['dist-pages/**'] },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  webBackendBoundaryRule,
  frozenLegacyAppRule,
];
