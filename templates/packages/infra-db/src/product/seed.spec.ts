import { PrismaService } from '../prisma-client.js';
import { seedProducts, type Catalog } from './seed.js';
import { wipeCommissionTables } from '../commission/commission-fixtures.spec-helper.js';

/**
 * Integration test against the real `store_mgmt` Postgres database. Covers
 * the spec's "Seed produces 11 active categories" and "Seeded products
 * reference a valid category" scenarios, plus idempotency (re-running the
 * seed must never duplicate rows). Uses a small fixture catalog (not the
 * full 99-product `catalog.json`) so the test stays fast and focused — the
 * fixture mirrors the real file's exact 11 slugs.
 */
describe('seedProducts', () => {
  let prisma: PrismaService;

  const catalog: Catalog = {
    categories: [
      { id: 'cafeteras', name: 'Cafeteras' },
      { id: 'climatizacion', name: 'Climatización' },
      { id: 'cocinas', name: 'Cocinas' },
      { id: 'energia-solar', name: 'Energía Solar' },
      { id: 'freidoras', name: 'Freidoras' },
      { id: 'lavadoras', name: 'Lavadoras' },
      { id: 'licuadoras', name: 'Licuadoras' },
      { id: 'ollas', name: 'Ollas' },
      { id: 'refrigeracion', name: 'Refrigeración' },
      { id: 'tv-y-audio', name: 'TV y Audio' },
      { id: 'utiles', name: 'Útiles' },
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
    prisma = new PrismaService();
  });

  afterEach(async () => {
    // First: commission rows RESTRICT the product delete below.
    await wipeCommissionTables(prisma);
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces exactly one active Category row per catalog slug', async () => {
    await seedProducts(prisma, catalog);

    const categories = await prisma.category.findMany();
    expect(categories).toHaveLength(catalog.categories.length);
    expect(categories.every((c) => c.active)).toBe(true);
    expect(categories.map((c) => c.slug).sort()).toEqual(
      catalog.categories.map((c) => c.id).sort(),
    );
  });

  it('every seeded product.categoryId resolves to one of the seeded categories — never dangling', async () => {
    await seedProducts(prisma, catalog);

    const categories = await prisma.category.findMany();
    const categoryIds = new Set(categories.map((c) => c.id));
    const products = await prisma.product.findMany();

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

    await expect(seedProducts(prisma, badCatalog)).rejects.toThrow();
  });

  it('is idempotent: running the seed twice yields the same 11-category / product count, never duplicates', async () => {
    await seedProducts(prisma, catalog);
    const result = await seedProducts(prisma, catalog);

    expect(result.categoriesUpserted).toBe(catalog.categories.length);
    expect(result.productsUpserted).toBe(catalog.products.length);

    const categories = await prisma.category.findMany();
    const products = await prisma.product.findMany();
    expect(categories).toHaveLength(catalog.categories.length);
    expect(products).toHaveLength(catalog.products.length);
  });

  it('re-running the seed updates the same product row (deterministic id) instead of inserting a new one', async () => {
    await seedProducts(prisma, catalog);
    const firstRun = await prisma.product.findMany({ orderBy: { order: 'asc' } });

    await seedProducts(prisma, catalog);
    const secondRun = await prisma.product.findMany({ orderBy: { order: 'asc' } });

    expect(secondRun.map((p) => p.id).sort()).toEqual(firstRun.map((p) => p.id).sort());
  });
});
