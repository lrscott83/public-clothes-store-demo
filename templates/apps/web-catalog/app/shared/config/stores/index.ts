import { defaultStoreConfig } from './default.config';
import type { StoreConfig } from './types';

/**
 * Static map of provisioned slug → `StoreConfig` (design.md D9). Deliberately
 * static imports, never `import(`./${slug}`)` — Vite can't see modules at
 * build time, and an attacker-influenced module path is a real risk a
 * dynamic import would introduce for no benefit.
 */
export const STORE_CONFIGS: Record<string, StoreConfig> = {
  [defaultStoreConfig.slug]: defaultStoreConfig,
};

export function getStoreConfig(slug: string): StoreConfig | undefined {
  return STORE_CONFIGS[slug];
}

export type { StoreConfig } from './types';
