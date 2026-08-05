import { createHash } from 'node:crypto';
import {
  discountPriceToDecimalString,
  moneyFromDecimalString,
  moneyToDecimalString,
  percentToDecimalString,
} from '@store-mgmt/domain';
import type { PrismaService } from '../prisma-client.js';
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
 * SINGLE idempotent seed entrypoint — seeds every catalog Category AND
 * Product together, never split across separate per-module seed scripts.
 * Re-running never duplicates rows:
 *  - Category is upserted keyed on its unique `slug` (the natural key).
 *  - Product is upserted keyed on a deterministic UUID id (see
 *    `deterministicProductId`), since it has no other natural unique key.
 * Talks to Prisma directly (not the domain ports) — seeding is an
 * infra-db-specific concern, not a domain/application capability.
 * `cost` is a documented SYNTHETIC placeholder (`price * 0.6`) — no
 * real supplier-cost source yet (open input #4, design.md). Seeded rows are
 * always USD for both `price`/`cost` (catalog.json is USD-denominated).
 * Throws if a product references a category slug absent from
 * `catalog.categories` — never a dangling `categoryId`.
 */
export async function seedProducts(prisma: PrismaService, catalog: Catalog): Promise<SeedResult> {
  const categoryIdBySlug = new Map<string, string>();

  let categoryOrder = 1;
  for (const category of catalog.categories) {
    const row = await prisma.category.upsert({
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

    await prisma.product.upsert({
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

/**
 * Master-side sibling of `seedProducts` (design.md §1, P8; spec:
 * salesops-products "Category Catalog Seed Load"). Seeds the SAME 11
 * catalog.json slugs, once, as master `TemplateCategory`/`TemplateProduct`
 * rows — the source every tenant's OWN `Category`/`Product` rows are copied
 * from at provisioning time (`copy-catalog.ts`, D7 step 6), never a live
 * reference. Identical idempotency strategy to `seedProducts`: `Category`
 * (here `TemplateCategory`) upserted on its unique `slug`, `Product` (here
 * `TemplateProduct`) upserted on the same deterministic UUID id — the two
 * are independent tables (master vs tenant schema, no shared rows), so
 * reusing `deterministicProductId` here does not collide with anything
 * `seedProducts` writes on the tenant side.
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
