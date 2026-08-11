import { config as baseConfig } from '@store-mgmt/eslint-config/base';

export default [...baseConfig, { ignores: ['eslint.config.mjs', 'dist/**', 'scripts/**'] }];
