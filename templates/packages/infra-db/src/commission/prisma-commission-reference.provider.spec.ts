import { randomUUID } from 'node:crypto';
import { moneyToDecimalString } from '@store-mgmt/domain';
import { TenantDefaultPrismaService } from '../tenant/tenant-default-prisma.service.js';
import { PrismaCommissionReferenceProvider } from './prisma-commission-reference.provider.js';

/**
 * Integration tests against the real `store_mgmt_test` database.
 *
 * The load-bearing property here is a NEGATIVE one: a product with no
 * configured commission must come back `undefined`, never `money(0n, 'MN')`.
 * Those two are different facts — "nobody has set this yet" versus "this earns
 * nothing" — and a provider that collapses them would under-pay an agent while
 * producing an accrual that looks perfectly complete.
 */
describe('PrismaCommissionReferenceProvider', () => {
  let prisma: TenantDefaultPrismaService;
  let provider: PrismaCommissionReferenceProvider;
  let categoryId: string;

  beforeAll(async () => {
    prisma = new TenantDefaultPrismaService();
    provider = new PrismaCommissionReferenceProvider(prisma);
    const category = await prisma.category.upsert({
      where: { slug: 'commission-spec' },
      update: {},
      create: { name: 'Commission Spec', slug: 'commission-spec', order: 900, active: true },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await prisma.productCommissionReference.deleteMany({});
    await prisma.product.deleteMany({ where: { categoryId } });
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  async function createProduct(name: string): Promise<string> {
    const product = await prisma.product.create({
      data: {
        name: `${name}.${randomUUID()}`,
        description: 'commission spec fixture',
        price: '1000.00',
        priceCurrency: 'MN',
        cost: '500.00',
        costCurrency: 'MN',
        categoryId,
        image: 'commission-spec.png',
        order: 1,
      },
    });
    return product.id;
  }

  it('returns the configured commission as MN Money', async () => {
    const productId = await createProduct('Configured');
    await prisma.productCommissionReference.create({ data: { productId, amountMn: '350.00' } });

    const result = await provider.commissionFor(productId);

    expect(result).toBeDefined();
    expect(result!.currency).toBe('MN');
    expect(moneyToDecimalString(result!)).toBe('350.00');
  });

  it('returns undefined — NOT zero — for a product with no reference', async () => {
    const productId = await createProduct('Unconfigured');

    const result = await provider.commissionFor(productId);

    expect(result).toBeUndefined();
    // Spelled out because this is the exact mistake the type would otherwise
    // permit: `money(0n, 'MN')` is falsy-adjacent and would flow silently into
    // an accrual total as a legitimate-looking zero.
    expect(result).not.toEqual({ minorUnits: 0n, currency: 'MN' });
  });

  it('returns undefined for a product id that does not exist at all', async () => {
    expect(await provider.commissionFor(randomUUID())).toBeUndefined();
  });

  it('preserves an explicitly configured zero, distinguishing it from "unconfigured"', async () => {
    // A deliberate 0.00 IS a decision ("this product earns nothing") and must
    // survive the round trip as a value, not decay into an absence.
    const productId = await createProduct('ExplicitZero');
    await prisma.productCommissionReference.create({ data: { productId, amountMn: '0.00' } });

    const result = await provider.commissionFor(productId);

    expect(result).toBeDefined();
    expect(result!.minorUnits).toBe(0n);
  });

  describe('commissionsFor — the batch form accrual uses', () => {
    it('returns one entry per CONFIGURED id and omits the rest, never padding with zeros', async () => {
      const configured = await createProduct('BatchConfigured');
      const unconfigured = await createProduct('BatchUnconfigured');
      await prisma.productCommissionReference.create({
        data: { productId: configured, amountMn: '120.50' },
      });

      const result = await provider.commissionsFor([configured, unconfigured]);

      expect(result.size).toBe(1);
      expect(moneyToDecimalString(result.get(configured)!)).toBe('120.50');
      expect(result.has(unconfigured)).toBe(false);
    });

    it('returns an empty map for an empty input, without querying for everything', async () => {
      const configured = await createProduct('ShouldNotAppear');
      await prisma.productCommissionReference.create({
        data: { productId: configured, amountMn: '99.00' },
      });

      expect((await provider.commissionsFor([])).size).toBe(0);
    });

    it('deduplicates repeated ids — an order can carry the same product on two lines', async () => {
      const productId = await createProduct('Repeated');
      await prisma.productCommissionReference.create({ data: { productId, amountMn: '75.00' } });

      const result = await provider.commissionsFor([productId, productId]);

      expect(result.size).toBe(1);
      expect(moneyToDecimalString(result.get(productId)!)).toBe('75.00');
    });
  });
});
