import type { CatalogData, CatalogProvider } from './types';

/**
 * Default `CatalogProvider`: synchronous, backed by a build-time-imported
 * `CatalogData` object (typically a static `catalog.json`). No network
 * calls — safe to use during prerender.
 */
export function createBakedCatalogProvider(data: CatalogData): CatalogProvider {
  const byId = new Map(data.products.map((product) => [product.id, product]));

  return {
    getCategories: () => data.categories,
    getProducts: () => data.products,
    getProductById: (id) => byId.get(id),
    getProductsByCategory: (categoryId) => data.products.filter((product) => product.categoryId === categoryId),
  };
}
