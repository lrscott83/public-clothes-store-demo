import { createHash } from 'node:crypto';
import {
  discountPriceToDecimalString,
  moneyFromDecimalString,
  moneyToDecimalString,
  percentToDecimalString,
} from '@store-mgmt/domain';
import type { PrismaMasterService } from '../master-prisma-client.js';

/** A single entry from the MVP's `catalog.json` `categories` array. */
export interface CatalogCategory {
  readonly id: string;
  readonly name: string;
}

/** A single entry from the MVP's `catalog.json` `products` array. */
export interface CatalogProduct {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly categoryId: string;
  readonly image: string;
}

/** Shape of the parsed `catalog.json`. Reading the file is the caller's job — this stays pure w.r.t. I/O. */
export interface Catalog {
  readonly categories: readonly CatalogCategory[];
  readonly products: readonly CatalogProduct[];
}

export interface SeedResult {
  readonly categoriesUpserted: number;
  readonly productsUpserted: number;
}

/**
 * Fixed, arbitrary namespace UUID for deriving deterministic seed-product
 * ids (RFC 4122 UUID v5). Never reused for any other purpose — changing
 * this constant would re-seed every product as "new" on the next run.
 */
const PRODUCT_SEED_NAMESPACE = '6b1b2e4a-2c1e-4b8b-9e3a-9f6f8d9b0a10';

/**
 * Deterministic UUID v5 derived from the catalog.json product id, so
 * re-running the seed always resolves to the SAME `Product.id` for the
 * same catalog entry — the basis for idempotent upsert. `Product` has no
 * other natural unique key usable here: `sku` is nullable/not unique, and
 * `id` is normally a random DB-generated UUID on ordinary `create()`.
 */
function deterministicProductId(catalogProductId: string): string {
  const namespaceBytes = Buffer.from(PRODUCT_SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(`product:${catalogProductId}`, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes, nameBytes])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Master-side catalog template seed (design.md §1, P8; spec:
 * salesops-products "Category Catalog Seed Load"). Seeds the 11
 * catalog.json slugs, once, as master `TemplateCategory`/`TemplateProduct`
 * rows — the source every tenant's OWN `Category`/`Product` rows are copied
 * from at provisioning time (`copy-catalog.ts`, D7 step 6), never a live
 * reference. `Category`/`Product` upserted on `TemplateCategory.slug`/a
 * deterministic UUID id (see `deterministicProductId`).
 *
 * task 14.2: this used to have a tenant-side sibling, `seedProducts`,
 * which wrote a catalog directly onto a shared `public` schema's
 * `Category`/`Product` tables from the pre-split monolith client. Deleted
 * here — every tenant's catalog is now populated exclusively by
 * `copyCatalog` at provisioning time (D7 step 6), so a second, independent
 * write path straight from `catalog.json` was redundant and, worse, could
 * drift from what `copyCatalog` actually copies.
 */
export async function seedTemplateCatalog(
  prisma: PrismaMasterService,
  catalog: Catalog,
): Promise<SeedResult> {
  const categoryIdBySlug = new Map<string, string>();

  let categoryOrder = 1;
  for (const category of catalog.categories) {
    const row = await prisma.templateCategory.upsert({
      where: { slug: category.id },
      update: { name: category.name, order: categoryOrder },
      create: { name: category.name, slug: category.id, order: categoryOrder, active: true },
    });
    categoryIdBySlug.set(category.id, row.id);
    categoryOrder++;
  }

  let productOrder = 1;
  for (const product of catalog.products) {
    const categoryId = categoryIdBySlug.get(product.categoryId);
    if (!categoryId) {
      throw new Error(
        `Seed catalog product "${product.id}" references unknown category slug "${product.categoryId}"`,
      );
    }

    const id = deterministicProductId(product.id);
    const price = moneyToDecimalString(moneyFromDecimalString(product.price.toFixed(2), 'USD'));
    // SYNTHETIC placeholder until a real supplier-cost source exists (open
    // input #4, design.md) — never presented as real cost data.
    const cost = moneyToDecimalString(
      moneyFromDecimalString((product.price * 0.6).toFixed(2), 'USD'),
    );

    await prisma.templateProduct.upsert({
      where: { id },
      update: {
        name: product.name,
        description: product.description,
        price,
        priceCurrency: 'USD',
        cost,
        costCurrency: 'USD',
        categoryId,
        image: product.image,
        order: productOrder,
      },
      create: {
        id,
        name: product.name,
        description: product.description,
        price,
        priceCurrency: 'USD',
        percentDiscountPrice: percentToDecimalString(0n),
        discountPrice: discountPriceToDecimalString(0n),
        cost,
        costCurrency: 'USD',
        categoryId,
        image: product.image,
        isNew: false,
        order: productOrder,
        active: true,
      },
    });
    productOrder++;
  }

  return {
    categoriesUpserted: catalog.categories.length,
    productsUpserted: catalog.products.length,
  };
}
