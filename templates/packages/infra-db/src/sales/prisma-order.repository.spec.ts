import type { ExchangeRate } from '@store-mgmt/domain';
import {
  InsufficientStockError,
  InvalidOrderStateError,
  createOrder,
  money,
} from '@store-mgmt/domain';
import { PrismaService } from '../prisma-client.js';
import { PrismaCategoryRepository } from '../product/prisma-category.repository.js';
import { PrismaProductRepository } from '../product/prisma-product.repository.js';
import { PrismaWarehouseRepository } from '../inventory/prisma-warehouse.repository.js';
import { PrismaStockMovementRepository } from '../inventory/prisma-stock-movement.repository.js';
import { PrismaStockLevelRepository } from '../inventory/prisma-stock-level.repository.js';
import { PrismaCustomerRepository } from '../customer/prisma-customer.repository.js';
import { PrismaCurrencyRepository } from '../currency/prisma-currency.repository.js';
import { PrismaOrderRepository } from './prisma-order.repository.js';

const AT = new Date('2026-07-22T00:00:00Z');

describe('PrismaOrderRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaOrderRepository;
  let categoryRepository: PrismaCategoryRepository;
  let productRepository: PrismaProductRepository;
  let warehouseRepository: PrismaWarehouseRepository;
  let stockMovementRepository: PrismaStockMovementRepository;
  let stockLevelRepository: PrismaStockLevelRepository;
  let customerRepository: PrismaCustomerRepository;
  let currencyRepository: PrismaCurrencyRepository;

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new PrismaOrderRepository(prisma);
    categoryRepository = new PrismaCategoryRepository(prisma);
    productRepository = new PrismaProductRepository(prisma);
    warehouseRepository = new PrismaWarehouseRepository(prisma);
    stockMovementRepository = new PrismaStockMovementRepository(prisma);
    stockLevelRepository = new PrismaStockLevelRepository(prisma);
    customerRepository = new PrismaCustomerRepository(prisma);
    currencyRepository = new PrismaCurrencyRepository(prisma);
  });

  afterEach(async () => {
    await prisma.orderPayment.deleteMany({});
    await prisma.saleCredit.deleteMany({});
    await prisma.orderLine.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.stockLevel.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await prisma.customer.deleteMany({});
    // `company_user` has NO FK to `app_user` (soft FK by design) — deleting
    // users alone would leave orphan assignments behind and trip the §7
    // backfill gate.
    await prisma.companyUser.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.exchangeRate.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

  /**
   * The `CompanyUser.id` every fixture order is attributed to. Set by
   * `seedFixtures` and read by `buildSingleLineOrder`, which has too many
   * positional parameters already to take another one. The FK is
   * ON DELETE RESTRICT, so this must be a row that really exists.
   */
  let attributedCompanyUserId: string;

  async function seedFixtures() {
    const category = await categoryRepository.create({ name: 'Cafeteras', slug: 'cafeteras', order: 1 });
    const product = await productRepository.create({
      name: 'Cafetera',
      description: 'desc',
      price: { minorUnits: 10000n, currency: 'USD' },
      cost: { minorUnits: 6000n, currency: 'USD' },
      categoryId: category.id,
      image: 'x.png',
      order: 1,
    });
    const warehouse = await warehouseRepository.create({ name: 'Pinar del Río' });
    // Every Customer now requires an existing User (backend-users-roles,
    // Customer.userId 1:1) — mint one for this fixture.
    const user = await prisma.user.create({
      data: { login: 'ana.torres.spec', passwordHash: VALID_HASH, fullName: 'Ana Torres' },
    });
    const customer = await customerRepository.create({ fullName: 'Ana Torres', userId: user.id });

    const company = await prisma.company.upsert({
      where: { slug: 'default' },
      update: {},
      create: { name: 'Tienda Prueba', slug: 'default' },
    });
    const agentUser = await prisma.user.create({
      data: { login: 'sales.agent.spec', passwordHash: VALID_HASH, fullName: 'Gestor Spec' },
    });
    const assignment = await prisma.companyUser.create({
      data: { userId: agentUser.id, companyId: company.id, role: 32, status: 'ACTIVE' },
    });
    attributedCompanyUserId = assignment.id;

    return { category, product, warehouse, customer, assignment };
  }

  async function stockIn(productId: string, warehouseId: string, quantity: number) {
    await stockMovementRepository.record({
      productId,
      warehouseId,
      type: 'purchase_in',
      quantity,
    });
  }

  function buildSingleLineOrder(
    productId: string,
    productName: string,
    categoryName: string,
    warehouseId: string,
    customerId: string,
    customerName: string,
    quantity = 2,
    rates: ExchangeRate[] = [],
  ) {
    return createOrder(
      {
        customerId,
        customerName,
        warehouseId,
        deliveryMode: 'pickup',
        attributedCompanyUserId,
        lines: [
          {
            productId,
            productName,
            categoryName,
            price: money(10000n, 'USD'), // 100.00 USD
            quantity,
          },
        ],
        payments: [{ channel: 'ZELLE', amount: money(10000n * BigInt(quantity), 'USD') }],
      },
      rates,
      AT,
    );
  }

  describe('create / findById — aggregate round-trip (4.3)', () => {
    it('persists order+lines+payments in one round-trip; deliveryMode required; initial status=created', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );

      const created = await repository.create(order);

      expect(created.status).toBe('created');
      expect(created.deliveryMode).toBe('pickup');
      expect(created.lines).toHaveLength(1);
      expect(created.payments).toHaveLength(1);
      expect(created.currency).toBe('USD');
    });

    it('round-trips attributedCompanyUserId through create and findById', async () => {
      const { product, warehouse, customer, assignment } = await seedFixtures();
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );

      const created = await repository.create(order);
      const reloaded = await repository.findById(created.id);

      // Write AND read, not just write: a column mapped on the way in but
      // dropped in `toDomain` would leave every loaded order looking
      // unattributed, and the commission ledger reads through this path.
      expect(created.attributedCompanyUserId).toBe(assignment.id);
      expect(reloaded?.attributedCompanyUserId).toBe(assignment.id);
    });

    it('refuses to delete a CompanyUser that has sales attributed to it (ON DELETE RESTRICT)', async () => {
      const { product, warehouse, customer, assignment } = await seedFixtures();
      await repository.create(
        buildSingleLineOrder(
          product.id,
          product.name,
          'Cafeteras',
          warehouse.id,
          customer.id,
          customer.fullName,
        ),
      );

      // SET NULL here would silently erase who earned the commission, so the
      // FK restricts instead. Retiring an agent is a `status` change.
      await expect(prisma.companyUser.delete({ where: { id: assignment.id } })).rejects.toThrow();
    });

    it('findById returns the full aggregate via one include; FK relations resolve both sides', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );
      const created = await repository.create(order);

      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.customerId).toBe(customer.id);
      expect(found?.warehouseId).toBe(warehouse.id);
      expect(found?.lines[0]?.productId).toBe(product.id);
      expect(found?.lines[0]?.lineTotalOrder.minorUnits).toBe(order.lines[0]?.lineTotalOrder.minorUnits);
      expect(found?.payments[0]?.amountInOrderCurrency.minorUnits).toBe(
        order.payments[0]?.amountInOrderCurrency.minorUnits,
      );
      expect(found?.total.minorUnits).toBe(order.total.minorUnits);
    });

    it('findById resolves unknown id to null', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('confirm — created -> verified (4.5, 4.7)', () => {
    it('rejects a non-created source', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      await expect(repository.confirm(created.id)).rejects.toThrow(InvalidOrderStateError);
    });

    it('freezes rate+totals and reserves each line (reserved += qty), no onHand/sale_out change', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
        3,
      );
      const created = await repository.create(order);

      const confirmed = await repository.confirm(created.id);

      expect(confirmed.status).toBe('verified');
      expect(confirmed.verifiedAt).not.toBeNull();

      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(10); // unchanged
      expect(level?.reserved).toBe(3); // reserved
    });

    it('reserve beyond available on one line throws InsufficientStockError, whole tx rolls back', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 1); // only 1 in stock
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
        5, // needs 5
      );
      const created = await repository.create(order);

      await expect(repository.confirm(created.id)).rejects.toThrow(InsufficientStockError);

      const stillCreated = await repository.findById(created.id);
      expect(stillCreated?.status).toBe('created');
      expect(stillCreated?.verifiedAt).toBeNull();

      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.reserved).toBe(0); // zero reservation persisted
    });
  });

  describe('deliver — verified -> delivered (4.9, 4.11)', () => {
    it('rejects a non-verified source', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );
      const created = await repository.create(order);

      await expect(repository.deliver(created.id)).rejects.toThrow(InvalidOrderStateError);
    });

    it('releases (reserved -= qty) then sale_out (onHand -= qty), stamps deliveredAt', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
        4,
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      const delivered = await repository.deliver(created.id);

      expect(delivered.status).toBe('delivered');
      expect(delivered.deliveredAt).not.toBeNull();

      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(6); // 10 - 4
      expect(level?.reserved).toBe(0); // released
    });

    it('delivers at zero stock margin (onHand === reserved) — release-before-sale_out keeps the reserved <= on_hand invariant clean (W4)', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 4);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
        4,
      );
      const created = await repository.create(order);
      await repository.confirm(created.id); // onHand=4, reserved=4 — ZERO available margin

      const delivered = await repository.deliver(created.id);

      // Load-bearing ordering (design.md #4): if deliver ran sale_out BEFORE
      // release, the intermediate row would be onHand=0 while reserved is still
      // 4 -> violates the IMMEDIATE `reserved <= on_hand` CHECK and rolls the
      // whole tx back. Success at the zero margin is what makes the ordering
      // observable — flip the two calls and this test goes red.
      expect(delivered.status).toBe('delivered');
      expect(delivered.deliveredAt).not.toBeNull();

      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(0); // 4 - 4
      expect(level?.reserved).toBe(0); // released
    });

    it('cannot drain reserved stock out-of-band: an adjustment_out below the reservation is rejected, the order stays verified and deliverable (W4)', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 4);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
        4,
      );
      const created = await repository.create(order);
      await repository.confirm(created.id); // onHand=4, reserved=4

      // Under the `reserved <= on_hand` invariant, reserved stock can never be
      // physically removed without first releasing/cancelling the reservation
      // — an out-of-band adjustment_out (that would drop onHand below reserved)
      // is refused by the DB. This replaces the old "sale_out exceeds onHand"
      // scenario, whose setup is now unconstructable by design.
      await expect(
        stockMovementRepository.record({
          productId: product.id,
          warehouseId: warehouse.id,
          type: 'adjustment_out',
          quantity: 3,
        }),
      ).rejects.toThrow();

      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(4); // unchanged — the drain was rejected
      expect(level?.reserved).toBe(4); // reservation intact

      // The reservation survived, so the verified order still delivers cleanly.
      const delivered = await repository.deliver(created.id);
      expect(delivered.status).toBe('delivered');
    });
  });

  describe('cancel — created|verified -> cancelled (4.13, 4.14)', () => {
    it('cancel from verified releases the reservation, onHand untouched', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
        5,
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      const cancelled = await repository.cancel(created.id);

      expect(cancelled.status).toBe('cancelled');
      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(10);
      expect(level?.reserved).toBe(0);
    });

    it('cancel from created has no stock effect, status -> cancelled directly', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );
      const created = await repository.create(order);

      const cancelled = await repository.cancel(created.id);

      expect(cancelled.status).toBe('cancelled');
      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(10);
      expect(level?.reserved ?? 0).toBe(0);
    });
  });

  describe('delivered is terminal (4.15)', () => {
    it('confirm/deliver/cancel are all rejected once delivered, with no mutation', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
        2,
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);
      await repository.deliver(created.id);

      await expect(repository.confirm(created.id)).rejects.toThrow(InvalidOrderStateError);
      await expect(repository.deliver(created.id)).rejects.toThrow(InvalidOrderStateError);
      await expect(repository.cancel(created.id)).rejects.toThrow(InvalidOrderStateError);

      const stillDelivered = await repository.findById(created.id);
      expect(stillDelivered?.status).toBe('delivered');
    });
  });

  describe('freeze is read-only (4.17)', () => {
    it('a later appendRate does not move a verified order stamped rateApplied/totals', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );
      const created = await repository.create(order);
      const confirmed = await repository.confirm(created.id);
      const totalBefore = confirmed.total.minorUnits;
      const lineTotalOrderBefore = confirmed.lines[0]?.lineTotalOrder.minorUnits;

      await currencyRepository.appendRate({
        channel: 'MN_TRANSFER',
        rate: 999999999n,
        effectiveFrom: new Date('2026-07-22T01:00:00Z'),
      });

      const reread = await repository.findById(created.id);
      expect(reread?.total.minorUnits).toBe(totalBefore);
      expect(reread?.lines[0]?.lineTotalOrder.minorUnits).toBe(lineTotalOrderBefore);
    });
  });

  describe('list / update (4.20)', () => {
    it('list() filters by customerId — an Order is never deleted, so it always lists', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );
      const created = await repository.create(order);

      const forCustomer = await repository.list({ customerId: customer.id });
      expect(forCustomer.find((o) => o.id === created.id)).toBeDefined();

      const forOtherCustomer = await repository.list({ customerId: '00000000-0000-0000-0000-000000000000' });
      expect(forOtherCustomer.find((o) => o.id === created.id)).toBeUndefined();
    });

    it('update() patches scalar fields', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      const order = buildSingleLineOrder(
        product.id,
        product.name,
        'Cafeteras',
        warehouse.id,
        customer.id,
        customer.fullName,
      );
      const created = await repository.create(order);

      const updated = await repository.update(created.id, { customerName: 'Nueva Cliente' });
      expect(updated.customerName).toBe('Nueva Cliente');
    });
  });
});
