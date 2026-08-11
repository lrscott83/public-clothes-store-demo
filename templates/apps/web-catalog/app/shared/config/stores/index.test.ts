import { describe, it, expect } from 'vitest';
import { getStoreConfig, STORE_CONFIGS } from './index';
import { defaultStoreConfig } from './default.config';

describe('getStoreConfig', () => {
  it('resolves the seeded "default" slug to defaultStoreConfig', () => {
    expect(getStoreConfig('default')).toBe(defaultStoreConfig);
  });

  it('returns undefined for a slug with no matching config', () => {
    expect(getStoreConfig('does-not-exist')).toBeUndefined();
  });

  it('keys STORE_CONFIGS by each config\'s own slug', () => {
    expect(STORE_CONFIGS[defaultStoreConfig.slug]).toBe(defaultStoreConfig);
  });
});
