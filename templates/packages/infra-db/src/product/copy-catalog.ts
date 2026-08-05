import type { PrismaMasterService } from '../master-prisma-client.js';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/client.js';

export interface CopyCatalogResult {
  readonly categoriesCopied: number;
  readonly productsCopied: number;
}

/**
 * Copies the master `TemplateCategory`/`TemplateProduct` rows into a
 * tenant's own `Category`/`Product` tables (design.md D7 step 6, P8/P9;
 * spec: salesops-products "Category Catalog Seed Load", "Tenant Catalog Is
 * Independently Editable"). Always AWAITED by the caller — this is the
 * primitive that closes the landmine poolops leaves open with
 * `void seedNewCompany(...)`: a `Promise` with no floating call anywhere,
 * so a new tenant never has an owner without a catalog for longer than the
 * caller chooses to await.
 *
 * The tenant `Category`/`Product` rows are created with the SAME `id` as
 * their master template row. That is not a live reference — Prisma forbids
 * a cross-schema `@relation` (design.md §1), so there is no FK between the
 * two tables, and each tenant's copy is a fully independent row from the
 * moment it lands. Reusing the id only makes the copy trivially idempotent
 * (`upsert` by `id`, no separate mapping table needed) and keeps a
 * `Product.categoryId` pointing at the right `Category` within the SAME
 * tenant schema without remapping.
 *
 * Idempotent: re-running against a tenant that already has its catalog
 * copied re-upserts every row from the current master template state and
 * creates no duplicates (spec: "Re-provisioning path stays idempotent").
 */
export async function copyCatalog(
  master: PrismaMasterService,
  tenant: TenantPrismaClient,
): Promise<CopyCatalogResult> {
  const templateCategories = await master.templateCategory.findMany({ orderBy: { order: 'asc' } });
  const templateProducts = await master.templateProduct.findMany({ orderBy: { order: 'asc' } });

  for (const category of templateCategories) {
    await tenant.category.upsert({
      where: { id: category.id },
      update: {
        name: category.name,
        slug: category.slug,
        image: category.image,
        icon: category.icon,
        order: category.order,
        active: category.active,
      },
      create: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.image,
        icon: category.icon,
        order: category.order,
        active: category.active,
      },
    });
  }

  for (const product of templateProducts) {
    await tenant.product.upsert({
      where: { id: product.id },
      update: {
        name: product.name,
        description: product.description,
        sku: product.sku,
        barcode: product.barcode,
        price: product.price,
        priceCurrency: product.priceCurrency,
        percentDiscountPrice: product.percentDiscountPrice,
        discountPrice: product.discountPrice,
        cost: product.cost,
        costCurrency: product.costCurrency,
        categoryId: product.categoryId,
        image: product.image,
        isNew: product.isNew,
        order: product.order,
        active: product.active,
      },
      create: {
        id: product.id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        barcode: product.barcode,
        price: product.price,
        priceCurrency: product.priceCurrency,
        percentDiscountPrice: product.percentDiscountPrice,
        discountPrice: product.discountPrice,
        cost: product.cost,
        costCurrency: product.costCurrency,
        categoryId: product.categoryId,
        image: product.image,
        isNew: product.isNew,
        order: product.order,
        active: product.active,
      },
    });
  }

  return {
    categoriesCopied: templateCategories.length,
    productsCopied: templateProducts.length,
  };
}
