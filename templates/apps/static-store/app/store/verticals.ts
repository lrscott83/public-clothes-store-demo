import type { StoreVertical } from '@store-mgmt/storefront/config';
import { clothesConfig } from '../../verticals/clothes/store.config';
import { demoConfig } from '../../verticals/demo/store.config';

/**
 * Static (not dynamic) import registry. Prerendering the active vertical
 * requires its `StoreConfig` to be resolvable at build time in Node, so
 * every vertical gets exactly one static import line here — `import.meta.glob`
 * was rejected for the same reason (see design.md Section 5).
 *
 * Adding a vertical = add a `verticals/{slug}/store.config.ts` folder + one
 * line in this map. `demo` is proof of that claim: it required zero engine
 * or component changes, only this line + its own data folder.
 */
export const VERTICALS: Record<string, StoreVertical> = {
  clothes: { slug: 'clothes', config: clothesConfig },
  demo: { slug: 'demo', config: demoConfig },
};
