import config from '@store-mgmt/eslint-config/react-router';
import { webBackendBoundaryRule } from '@store-mgmt/eslint-config/backend-boundaries';

export default [
  ...config,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  webBackendBoundaryRule,
];
