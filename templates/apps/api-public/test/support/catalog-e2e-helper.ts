import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import {
  PrismaMasterService,
  TenantDatabaseService,
  TenantPrismaFactory,
  schemaNameFor,
} from '@store-mgmt/infra-db';

/**
 * `api-public` has no auth and no write endpoints — unlike
 * `api-salesops/test/support/auth-e2e-helper.ts`, this helper mints
 * tenants and seeds catalog rows by writing DIRECTLY through
 * `TenantPrismaFactory`/`TenantDatabaseService`, never through HTTP. Same
 * provisioning primitives that helper reuses (Phase 4/10, design D7 in
 * spirit), addressed the same way.
 */
export interface TenantServices {
  readonly masterPrisma: PrismaMasterService;
  readonly tenantDatabaseService: TenantDatabaseService;
  readonly tenantPrismaFactory: TenantPrismaFactory;
}

export type TenantPrismaClient = ReturnType<TenantPrismaFactory['getClient']>;

export function getTenantServices(moduleFixture: TestingModule): TenantServices {
  return {
    masterPrisma: moduleFixture.get(PrismaMasterService),
    tenantDatabaseService: moduleFixture.get(TenantDatabaseService),
    tenantPrismaFactory: moduleFixture.get(TenantPrismaFactory),
  };
}

export interface ProvisionedStore {
  readonly companyId: string;
  readonly slug: string;
  readonly schemaName: string;
}

/** Provisions a REAL master `Company` row + a REAL `CREATE SCHEMA` tenant schema. `isActive: false` mints a company `PublicTenantGuard` must reject exactly like an unknown slug (design D4). */
export async function provisionStore(
  services: TenantServices,
  overrides: { slug?: string; name?: string; isActive?: boolean } = {},
): Promise<ProvisionedStore> {
  const slug = overrides.slug ?? `store-${randomUUID().slice(0, 8)}`;
  const company = await services.masterPrisma.company.create({
    data: { name: overrides.name ?? `Store ${slug}`, slug },
  });
  const schemaName = schemaNameFor(company.id);
  await services.tenantDatabaseService.createSchema(schemaName);
  await services.masterPrisma.company.update({
    where: { id: company.id },
    data: { schemaName, ...(overrides.isActive === false ? { isActive: false } : {}) },
  });
  return { companyId: company.id, slug, schemaName };
}

export function tenantClientFor(services: TenantServices, schemaName: string): TenantPrismaClient {
  return services.tenantPrismaFactory.getClient(schemaName);
}

export interface SeededProduct {
  readonly id: string;
  readonly name: string;
}

/** Writes one `Category` + one `Product` directly into `store`'s tenant schema — the rows a real seeded catalog would have, without going through any write endpoint. */
export async function seedCategoryAndProduct(
  services: TenantServices,
  store: ProvisionedStore,
  overrides: { categoryName?: string; categorySlug?: string; productName?: string; price?: string } = {},
): Promise<{ categoryId: string; product: SeededProduct }> {
  const client = tenantClientFor(services, store.schemaName);
  const category = await client.category.create({
    data: {
      name: overrides.categoryName ?? 'Cafeteras',
      slug: overrides.categorySlug ?? `cafeteras-${randomUUID().slice(0, 8)}`,
      order: 1,
    },
  });
  const product = await client.product.create({
    data: {
      name: overrides.productName ?? `Producto de ${store.slug}`,
      description: 'Descripción de prueba.',
      price: overrides.price ?? '100.00',
      priceCurrency: 'USD',
      percentDiscountPrice: '0.00',
      discountPrice: '0.00',
      cost: '50.00',
      costCurrency: 'USD',
      categoryId: category.id,
      image: 'products/placeholder.webp',
      order: 1,
    },
  });
  return { categoryId: category.id, product: { id: product.id, name: product.name } };
}

/** Hygiene: every tenant schema an e2e run creates MUST be dropped afterwards, including on failure. */
export async function dropStores(
  services: TenantServices,
  stores: Iterable<ProvisionedStore>,
): Promise<void> {
  const list = [...stores];
  for (const store of list) {
    await services.tenantPrismaFactory.disposeClient(store.schemaName);
    await services.tenantDatabaseService.deleteSchema(store.schemaName);
  }
  if (list.length > 0) {
    await services.masterPrisma.company.deleteMany({ where: { id: { in: list.map((s) => s.companyId) } } });
  }
}
