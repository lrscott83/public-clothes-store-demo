import config from '@store-mgmt/eslint-config/react-router';
import globals from 'globals';

export default [
  ...config,
  { ignores: ['dist-pages/**'] },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
