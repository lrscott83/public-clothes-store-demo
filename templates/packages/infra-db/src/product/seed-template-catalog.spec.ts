import { PrismaMasterService } from '../master-prisma-client.js';
import { seedTemplateCatalog, type Catalog } from './seed.js';

/**
 * Integration test against the real master `store_mgmt_test` Postgres
 * database. Covers spec salesops-products "Category Catalog Seed Load"
 * ("Master templates seed once", "Re-provisioning path stays idempotent").
 * Mirrors `seedProducts`'s own spec (`seed.spec.ts`) but targets the master
 * `TemplateCategory`/`TemplateProduct` tables instead of a tenant's
 * `Category`/`Product` — the per-tenant COPY step is `copyCatalog`
 * (`copy-catalog.spec.ts`), proven separately.
 */
describe('seedTemplateCatalog', () => {
  let prisma: PrismaMasterService;

  const catalog: Catalog = {
    categories: [
      { id: 'cafeteras', name: 'Cafeteras' },
      { id: 'climatizacion', name: 'Climatización' },
    ],
    products: [
      {
        id: '1',
        name: 'Cafetera de fogón 6 tazas',
        description: '6 tazas',
        price: 15,
        categoryId: 'cafeteras',
        image: 'products/cafeteras/cafeteras1.jpeg',
      },
      {
        id: '5',
        name: 'Ventilador Industrial 30" Royal',
        description: 'Marca: Royal',
        price: 140,
        categoryId: 'climatizacion',
        image: 'products/climatizacion/climatizacion1.jpeg',
      },
    ],
  };

  beforeAll(() => {
    prisma = new PrismaMasterService();
  });

  afterEach(async () => {
    await prisma.templateProduct.deleteMany({});
    await prisma.templateCategory.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces exactly one active TemplateCategory row per catalog slug', async () => {
    await seedTemplateCatalog(prisma, catalog);

    const categories = await prisma.templateCategory.findMany();
    expect(categories).toHaveLength(catalog.categories.length);
    expect(categories.every((c) => c.active)).toBe(true);
    expect(categories.map((c) => c.slug).sort()).toEqual(
      catalog.categories.map((c) => c.id).sort(),
    );
  });

  it('every seeded TemplateProduct.categoryId resolves to one of the seeded TemplateCategory rows', async () => {
    await seedTemplateCatalog(prisma, catalog);

    const categories = await prisma.templateCategory.findMany();
    const categoryIds = new Set(categories.map((c) => c.id));
    const products = await prisma.templateProduct.findMany();

    expect(products).toHaveLength(catalog.products.length);
    for (const product of products) {
      expect(categoryIds.has(product.categoryId)).toBe(true);
    }
  });

  it('throws when a product references an unknown category slug — never a dangling categoryId', async () => {
    const badCatalog: Catalog = {
      categories: [{ id: 'cafeteras', name: 'Cafeteras' }],
      products: [
        {
          id: '99',
          name: 'Producto huerfano',
          description: 'x',
          price: 10,
          categoryId: 'no-existe',
          image: 'x.png',
        },
      ],
    };

    await expect(seedTemplateCatalog(prisma, badCatalog)).rejects.toThrow();
  });

  it('is idempotent: running the seed twice yields the same category/product count, never duplicates', async () => {
    await seedTemplateCatalog(prisma, catalog);
    const result = await seedTemplateCatalog(prisma, catalog);

    expect(result.categoriesUpserted).toBe(catalog.categories.length);
    expect(result.productsUpserted).toBe(catalog.products.length);

    const categories = await prisma.templateCategory.findMany();
    const products = await prisma.templateProduct.findMany();
    expect(categories).toHaveLength(catalog.categories.length);
    expect(products).toHaveLength(catalog.products.length);
  });

  it('re-running the seed updates the same product row (deterministic id) instead of inserting a new one', async () => {
    await seedTemplateCatalog(prisma, catalog);
    const firstRun = await prisma.templateProduct.findMany({ orderBy: { order: 'asc' } });

    await seedTemplateCatalog(prisma, catalog);
    const secondRun = await prisma.templateProduct.findMany({ orderBy: { order: 'asc' } });

    expect(secondRun.map((p) => p.id).sort()).toEqual(firstRun.map((p) => p.id).sort());
  });
});
