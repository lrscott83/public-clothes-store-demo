import type { StoreConfig } from './types';

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === '';
}

/**
 * Validates a resolved `StoreConfig`, throwing a single `Error` listing
 * every problem found (field names included so failures are easy to fix).
 * Returns the same config instance on success for convenient chaining
 * (e.g. `validateStoreConfig(resolveVertical(...).config)`).
 */
export function validateStoreConfig(config: StoreConfig): StoreConfig {
  const errors: string[] = [];

  if (isBlank(config.vertical)) errors.push('"vertical" is required.');
  if (isBlank(config.brand?.name)) errors.push('"brand.name" is required.');
  if (isBlank(config.brand?.copyright)) errors.push('"brand.copyright" is required.');
  if (isBlank(config.locale)) errors.push('"locale" is required.');
  if (isBlank(config.currency)) errors.push('"currency" is required.');
  if (!config.theme || typeof config.theme !== 'object') errors.push('"theme" is required.');
  if (isBlank(config.logo?.alt)) errors.push('"logo.alt" is required.');
  if (isBlank(config.hero?.image)) errors.push('"hero.image" is required.');
  if (isBlank(config.hero?.heading)) errors.push('"hero.heading" is required.');
  if (isBlank(config.hero?.subheading)) errors.push('"hero.subheading" is required.');
  if (isBlank(config.footer?.copyright)) errors.push('"footer.copyright" is required.');

  if (!Array.isArray(config.nav) || config.nav.length === 0) {
    errors.push('"nav" must have at least 1 entry.');
  }

  const categories = config.catalog?.categories ?? [];
  const products = config.catalog?.products ?? [];

  if (categories.length === 0) errors.push('"catalog.categories" must have at least 1 entry.');
  if (products.length === 0) errors.push('"catalog.products" must have at least 1 entry.');

  const categoryIds = new Set(categories.map((category) => category.id));
  const seenProductIds = new Set<string>();
  const duplicateProductIds = new Set<string>();

  for (const product of products) {
    if (seenProductIds.has(product.id)) {
      duplicateProductIds.add(product.id);
    }
    seenProductIds.add(product.id);

    if (!categoryIds.has(product.categoryId)) {
      errors.push(`Product "${product.id}" has categoryId "${product.categoryId}" which does not exist in "catalog.categories".`);
    }

    if (product.originalPrice !== undefined && product.originalPrice <= product.price) {
      errors.push(`Product "${product.id}" has "originalPrice" (${product.originalPrice}) that is not greater than "price" (${product.price}).`);
    }
  }

  if (duplicateProductIds.size > 0) {
    errors.push(`Duplicate product id(s) found in "catalog.products": ${[...duplicateProductIds].join(', ')}.`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid StoreConfig:\n- ${errors.join('\n- ')}`);
  }

  return config;
}
