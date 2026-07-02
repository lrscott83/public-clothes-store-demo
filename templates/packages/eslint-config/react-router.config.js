// @ts-check
import globals from 'globals';
import { config as baseConfig } from './base.config.js';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      }
    },
    rules: {
      'turbo/no-undeclared-env-vars': ['warn', { allowList: ['DEV'] }]
    }
  },
  { ignores: ['eslint.config.mjs', 'build/**', '.react-router/**'] }
];
