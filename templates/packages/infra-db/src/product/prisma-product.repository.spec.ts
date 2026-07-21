import {
  discountPriceToDecimalString,
  moneyFromDecimalString,
  moneyToDecimalString,
} from '@store-mgmt/domain';
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
      cost: moneyFromDecimalString('89.99', 'USD'),
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
        discountPrice: 500n, // 5.00
      }),
    );

    expect(created.id).toEqual(expect.any(String));
    expect(created.categoryId).toBe(categoryId);
    expect(moneyToDecimalString(created.price)).toBe('149.99');
    expect(discountPriceToDecimalString(created.discountPrice)).toBe('5.00');
    expect(moneyToDecimalString(created.cost)).toBe('89.99');
    expect(created.percentDiscountPrice).toBe(1250n);
    expect(created.active).toBe(true);
  });

  it('create() honors caller-chosen currencies for price/cost, which MAY DIFFER', async () => {
    const created = await repository.create(
      validInput({
        price: moneyFromDecimalString('100.00', 'EUR'),
        cost: moneyFromDecimalString('60.00', 'MN'),
      }),
    );

    expect(created.price.currency).toBe('EUR');
    expect(moneyToDecimalString(created.price)).toBe('100.00');
    expect(created.cost.currency).toBe('MN');
    expect(moneyToDecimalString(created.cost)).toBe('60.00');

    const found = await repository.findById(created.id);
    expect(found?.price.currency).toBe('EUR');
    expect(found?.cost.currency).toBe('MN');
  });

  it('update() re-persists price/cost currency when the Money value changes', async () => {
    const created = await repository.create(validInput());

    const updated = await repository.update(created.id, {
      price: moneyFromDecimalString('200.00', 'EUR'),
      cost: moneyFromDecimalString('120.00', 'EUR'),
    });

    expect(updated.price.currency).toBe('EUR');
    expect(moneyToDecimalString(updated.price)).toBe('200.00');
    expect(updated.cost.currency).toBe('EUR');
    expect(moneyToDecimalString(updated.cost)).toBe('120.00');
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
