import { moneyFromDecimalString, moneyToDecimalString } from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';
import { PrismaCategoryRepository } from './prisma-category.repository.js';
import { PrismaProductRepository } from './prisma-product.repository.js';

/**
 * Integration tests against the real `store_mgmt` Postgres database (no
 * mocks) — same discipline as `prisma-currency.repository.spec.ts` and
 * `prisma-category.repository.spec.ts`.
 */
describe('PrismaProductRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaProductRepository;
  let categoryRepository: PrismaCategoryRepository;
  let categoryId: string;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaProductRepository(prisma);
    categoryRepository = new PrismaCategoryRepository(prisma);
  });

  beforeEach(async () => {
    const category = await categoryRepository.create({
      name: 'Cafeteras',
      slug: 'cafeteras',
      order: 1,
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Cafetera Express',
      description: 'Cafetera express de 15 bares.',
      price: moneyFromDecimalString('149.99', 'USD'),
      costoUSD: moneyFromDecimalString('89.99', 'USD'),
      categoryId,
      image: 'https://example.com/cafetera.png',
      order: 1,
      ...overrides,
    };
  }

  it('create() persists a Product linked to a valid categoryId, with Decimal<->Money round-trip fidelity', async () => {
    const created = await repository.create(
      validInput({
        percentDiscountPrice: 1250n, // 12.50%
        discountPrice: moneyFromDecimalString('5.00', 'USD'),
      }),
    );

    expect(created.id).toEqual(expect.any(String));
    expect(created.categoryId).toBe(categoryId);
    expect(moneyToDecimalString(created.price)).toBe('149.99');
    expect(moneyToDecimalString(created.discountPrice)).toBe('5.00');
    expect(moneyToDecimalString(created.costoUSD)).toBe('89.99');
    expect(created.percentDiscountPrice).toBe(1250n);
    expect(created.active).toBe(true);
  });

  it('findById() returns the full persisted shape', async () => {
    const created = await repository.create(validInput());

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.name).toBe('Cafetera Express');
    expect(found?.description).toBe('Cafetera express de 15 bares.');
    expect(moneyToDecimalString(found!.price)).toBe('149.99');
  });

  it('softDelete() flips active=false but the row is still findById-able (never hard-deleted)', async () => {
    const created = await repository.create(validInput());

    await repository.softDelete(created.id);

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.active).toBe(false);
  });

  it('list() excludes active=false products by default', async () => {
    const active = await repository.create(validInput({ name: 'Activo' }));
    const inactive = await repository.create(validInput({ name: 'Inactivo' }));
    await repository.softDelete(inactive.id);

    const defaultList = await repository.list();
    expect(defaultList.map((p) => p.id)).toContain(active.id);
    expect(defaultList.map((p) => p.id)).not.toContain(inactive.id);

    const fullList = await repository.list({ includeInactive: true });
    expect(fullList.map((p) => p.id)).toContain(inactive.id);
  });

  it('list() filters by categoryId', async () => {
    const other = await categoryRepository.create({ name: 'Ollas', slug: 'ollas', order: 2 });
    const matching = await repository.create(validInput());
    await repository.create(validInput({ name: 'Otra categoria', categoryId: other.id }));

    const filtered = await repository.list({ categoryId });
    expect(filtered.map((p) => p.id)).toEqual([matching.id]);
  });
});
