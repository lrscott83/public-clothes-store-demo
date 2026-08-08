import { randomUUID } from 'node:crypto';
import type { ExchangeRate } from '@store-mgmt/domain';
import {
  InsufficientStockError,
  InvalidOrderStateError,
  InvalidStockLevelError,
  createOrder,
  money,
} from '@store-mgmt/domain';
import { LOCK_TRANSACTION_BUDGET } from '../lock-budget.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { rowIsLocked, waitUntil } from '../lock-wait.spec-helper.js';
import { fakeTenantContext, useTenantSchema, assertAbsentFromPublicSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCategoryRepository } from '../product/prisma-category.repository.js';
import { PrismaProductRepository } from '../product/prisma-product.repository.js';
import { PrismaWarehouseRepository } from '../inventory/prisma-warehouse.repository.js';
import { PrismaStockMovementRepository } from '../inventory/prisma-stock-movement.repository.js';
import { PrismaStockLevelRepository } from '../inventory/prisma-stock-level.repository.js';
import { PrismaCustomerRepository } from '../customer/prisma-customer.repository.js';
import { PrismaCurrencyRepository } from '../currency/prisma-currency.repository.js';
import { PrismaOrderRepository } from './prisma-order.repository.js';

const AT = new Date('2026-07-22T00:00:00Z');

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`/`prisma-customer.repository.spec.ts`.
 */
describe('PrismaOrderRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let repository: PrismaOrderRepository;
  let categoryRepository: PrismaCategoryRepository;
  let productRepository: PrismaProductRepository;
  let warehouseRepository: PrismaWarehouseRepository;
  let stockMovementRepository: PrismaStockMovementRepository;
  let stockLevelRepository: PrismaStockLevelRepository;
  let customerRepository: PrismaCustomerRepository;
  let currencyRepository: PrismaCurrencyRepository;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    repository = new PrismaOrderRepository(tenantContext);
    customerRepository = new PrismaCustomerRepository(tenantContext);
    currencyRepository = new PrismaCurrencyRepository(tenantContext);
    // Category/Product/Warehouse/StockLevel/StockMovement repos are
    // re-sourced to TenantContextService as of task 6.3 — every repo this
    // suite builds now shares the SAME real tenant client/schema.
    categoryRepository = new PrismaCategoryRepository(tenantContext);
    productRepository = new PrismaProductRepository(tenantContext);
    warehouseRepository = new PrismaWarehouseRepository(tenantContext);
    stockMovementRepository = new PrismaStockMovementRepository(tenantContext);
    stockLevelRepository = new PrismaStockLevelRepository(tenantContext);
  });

  afterEach(async () => {
    // One tenant schema is shared by the whole suite (created once in
    // `beforeAll`), so rows accumulate across tests unless wiped here.
    // FK-safe order — same shape as the pre-6.2 cleanup, now against the
    // tenant client. `company_user` has no cross-schema FK to any master
    // `User` (D1 dropped it), so no separate "wipe users" step is needed.
    const prisma = tenantContext.getClient();
    await prisma.commissionPayment.deleteMany({});
    await prisma.commissionAccrual.deleteMany({});
    await prisma.productCommissionReference.deleteMany({});
    // `delivery_assignment.order_id` is ON DELETE RESTRICT too (Phase 5) —
    // must clear it (and its carrier, same FK style) BEFORE `order.deleteMany`.
    await prisma.deliveryAssignment.deleteMany({});
    await prisma.carrier.deleteMany({});
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
    await prisma.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
    await prisma.companyUser.deleteMany({});
    await prisma.exchangeRate.deleteMany({});
  });

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
    // Customer now FKs the tenant CompanyUser (design.md D1) — a tenant
    // CompanyUser needs no master User row to exist (the cross-schema FK was
    // dropped), so this mints one directly with a fresh id.
    const customerCompanyUser = await tenantContext.getClient().companyUser.create({
      data: { id: randomUUID(), role: 0 },
    });
    const customer = await customerRepository.create({
      fullName: 'Ana Torres',
      companyUserId: customerCompanyUser.id,
    });

    const assignment = await tenantContext.getClient().companyUser.create({
      data: { id: randomUUID(), role: 32 },
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
    deliveryMode: 'pickup' | 'delivery' = 'pickup',
  ) {
    return createOrder(
      {
        customerId,
        customerName,
        warehouseId,
        deliveryMode,
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
      // The trap this batch's instructions call out by name: a spec that
      // never provisions a tenant schema, or that reaches a master/default
      // client, can still pass for the wrong reason. `public` still holds a
      // same-named legacy `sales_order` table until task 14.2's reset.
      await assertAbsentFromPublicSchema('sales_order', 'id', created.id);
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
      await expect(
        tenantContext.getClient().companyUser.delete({ where: { id: assignment.id } }),
      ).rejects.toThrow();
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

  /** Shared by the `deliver` and `cancel` assignment-closing suites below. */
  async function seedCarrier() {
    return tenantContext.getClient().carrier.create({ data: { name: `Transportes ${randomUUID()}` } });
  }

  describe('deliver closes any open DeliveryAssignment atomically (Phase 5, design §2B/ADR-2)', () => {
    it('closes an in_transit assignment to delivered when a delivery-mode order is delivered', async () => {
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
        [],
        'delivery',
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      const carrier = await seedCarrier();
      const assignment = await tenantContext.getClient().deliveryAssignment.create({
        data: { orderId: created.id, carrierId: carrier.id, status: 'in_transit', assignedAt: AT },
      });

      const delivered = await repository.deliver(created.id);
      expect(delivered.status).toBe('delivered');

      const reloadedAssignment = await tenantContext
        .getClient()
        .deliveryAssignment.findUnique({ where: { id: assignment.id } });
      expect(reloadedAssignment?.status).toBe('delivered');
      expect(reloadedAssignment?.deliveredAt).not.toBeNull();
    });

    it('is a no-op for a delivery-mode order with no assignment — 0 rows is not an error', async () => {
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
        [],
        'delivery',
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      const delivered = await repository.deliver(created.id);

      expect(delivered.status).toBe('delivered');
      expect(delivered.deliveredAt).not.toBeNull();
    });

    /**
     * The close is the module's CENTRAL correctness invariant: an assignment
     * left `in_transit` behind a `delivered` order poisons every capacity read
     * forever. So the failure has to be injected where it can actually observe
     * a rolled-back close — i.e. AFTER `closeAssignmentOnDeliveryTx` has run.
     *
     * A previous version of this test corrupted the reservation so that
     * `applyReservationTx('release')` threw inside the per-line loop. That was
     * a genuine failure, but the close now runs AFTER that loop, so it never
     * executed at all — `expect(status).toBe('in_transit')` passed because
     * nothing had tried to change it, and the test could not have failed if
     * the close had been moved into its own transaction. Vacuous.
     *
     * A `BEFORE UPDATE` trigger on `sales_order` that raises when the row goes
     * `delivered` fires on the `tx.order.update` that comes AFTER the close,
     * inside the same transaction. Now the close HAS run and been rolled back,
     * which is exactly the state the assertion claims to observe.
     */
    it('rolls back the close itself when a step AFTER it fails — the assignment stays in_transit', async () => {
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
        [],
        'delivery',
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      const carrier = await seedCarrier();
      const assignment = await tenantContext.getClient().deliveryAssignment.create({
        data: { orderId: created.id, carrierId: carrier.id, status: 'in_transit', assignedAt: AT },
      });

      const prisma = tenantContext.getClient();
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION fail_after_assignment_close() RETURNS trigger AS $fn$
        BEGIN
          RAISE EXCEPTION 'post-close failure injected by prisma-order.repository.spec';
        END;
        $fn$ LANGUAGE plpgsql;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_after_assignment_close_trg
        BEFORE UPDATE ON "sales_order"
        FOR EACH ROW WHEN (NEW."status" = 'delivered')
        EXECUTE FUNCTION fail_after_assignment_close();
      `);

      try {
        await expect(repository.deliver(created.id)).rejects.toThrow(/post-close failure/);
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS fail_after_assignment_close_trg ON "sales_order"',
        );
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_after_assignment_close()');
      }

      const stillVerified = await repository.findById(created.id);
      expect(stillVerified?.status).toBe('verified');

      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(10); // the sale_out never committed
      expect(level?.reserved).toBe(4); // the release never committed either

      const reloadedAssignment = await tenantContext
        .getClient()
        .deliveryAssignment.findUnique({ where: { id: assignment.id } });
      // The close DID run in this transaction and was rolled back with it.
      // Move `closeAssignmentOnDeliveryTx` out into its own transaction and
      // this reads `delivered` — which is the regression the old version of
      // this test only claimed to catch.
      expect(reloadedAssignment?.status).toBe('in_transit');
      expect(reloadedAssignment?.deliveredAt).toBeNull();
    });

    /**
     * The per-line stock failure is still worth covering — it just proves a
     * DIFFERENT thing (the loop's own atomicity), and it must not be mistaken
     * for a guard on the close, which by then has not run yet.
     */
    it('rolls back the per-line stock work when a step BEFORE the close fails', async () => {
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
        [],
        'delivery',
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      // Corrupt the reservation DIRECTLY (bypassing every app-level guard,
      // typed `.update()` — not the raw guarded UPDATE) so that
      // `applyReservationTx('release')` inside `deliver()` finds `reserved=0`,
      // its own guarded UPDATE affects 0 rows, and it throws
      // `InvalidStockLevelError` — a genuine Postgres-level failure INSIDE
      // `deliver()`'s transaction.
      await tenantContext.getClient().stockLevel.update({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
        data: { reserved: 0 },
      });

      await expect(repository.deliver(created.id)).rejects.toThrow(InvalidStockLevelError);

      const stillVerified = await repository.findById(created.id);
      expect(stillVerified?.status).toBe('verified');

      const level = await stockLevelRepository.findByProductAndWarehouse(product.id, warehouse.id);
      expect(level?.onHand).toBe(10); // untouched
      expect(level?.reserved).toBe(0); // still our corrupted value — the failed release never committed
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

    it('cancels any open DeliveryAssignment in the SAME transaction — never leaves it in_transit', async () => {
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
        [],
        'delivery',
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      const carrier = await seedCarrier();
      const assignment = await tenantContext.getClient().deliveryAssignment.create({
        data: { orderId: created.id, carrierId: carrier.id, status: 'in_transit', assignedAt: AT },
      });

      await repository.cancel(created.id);

      const reloadedAssignment = await tenantContext
        .getClient()
        .deliveryAssignment.findUnique({ where: { id: assignment.id } });
      // `cancelled`, NOT `delivered`: counting a cancellation as a delivery
      // would corrupt `computeCarrierThroughput`. And not `in_transit`
      // either — that is the stranded row this closes, which no API path
      // could ever recover from.
      expect(reloadedAssignment?.status).toBe('cancelled');
      expect(reloadedAssignment?.deliveredAt).toBeNull();
    });

    it('is a no-op for a cancelled order with no assignment — 0 rows is not an error', async () => {
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
        [],
        'delivery',
      );
      const created = await repository.create(order);
      await repository.confirm(created.id);

      const cancelled = await repository.cancel(created.id);

      expect(cancelled.status).toBe('cancelled');
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

  /**
   * CLASS G1 — `IOrderDeliveryGateway.findOrderSnapshot`'s port doc says the
   * snapshot exists because loading the full aggregate to read three scalars
   * is a wasted read. Its only implementation went through
   * `OrderService.findById`, which loads exactly that aggregate — on the hot
   * path of every `assign` and every scoped `markDelivered`. This is the
   * narrow read that makes the claim true.
   */
  describe('findScopeProjection — the narrow read behind the delivery snapshot', () => {
    it('returns the four scoping scalars for an existing order', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      const created = await repository.create(
        buildSingleLineOrder(
          product.id,
          product.name,
          'Cafeteras',
          warehouse.id,
          customer.id,
          customer.fullName,
          2,
          [],
          'delivery',
        ),
      );

      const projection = await repository.findScopeProjection(created.id);

      expect(projection).toEqual({
        orderId: created.id,
        warehouseId: warehouse.id,
        deliveryMode: 'delivery',
        status: 'created',
      });
    });

    it('tracks the status through a transition', async () => {
      const { product, warehouse, customer } = await seedFixtures();
      await stockIn(product.id, warehouse.id, 10);
      const created = await repository.create(
        buildSingleLineOrder(
          product.id,
          product.name,
          'Cafeteras',
          warehouse.id,
          customer.id,
          customer.fullName,
          2,
          [],
          'pickup',
        ),
      );
      await repository.confirm(created.id);

      const projection = await repository.findScopeProjection(created.id);

      expect(projection?.status).toBe('verified');
      expect(projection?.deliveryMode).toBe('pickup');
    });

    it('returns null for an unknown id — never throws', async () => {
      await expect(repository.findScopeProjection(randomUUID())).resolves.toBeNull();
    });
  });

  /**
   * `lockOrderRowTx` gave the three transitions ONE global ordering at the
   * STEP level — order, then stock, then assignment — and its comment claimed
   * that closed the deadlock. It did not close it WITHIN the stock step: the
   * `include: { lines: true }` that drives the per-line loop carried no
   * `orderBy`, so the stock row locks were taken in whatever order Postgres
   * happened to return the lines — in practice insertion order, which differs
   * per order.
   *
   * Two concurrent transitions on DIFFERENT orders sharing the same products,
   * whose lines were entered in opposite order, therefore take the same two
   * `stock_level` locks in opposite order: a textbook cycle, `40P01`, and an
   * unmapped 500 for one of them. The upfront order lock made the window
   * WIDER, because every transition now holds its locks for longer.
   *
   * The property under test is the fix itself: locks are acquired in
   * `productId` order, independent of how the lines were inserted.
   */
  describe('stock locks are taken in productId order, not line-insertion order', () => {
    /**
     * Deliberately NOT a two-transaction deadlock reproduction. A real cycle
     * needs an interleaving neither test can force, so such a test passes for
     * the wrong reason far more often than it detects anything. This asserts
     * the ORDERING that makes a cycle impossible, deterministically:
     *
     * an outside transaction holds the HIGHER-sorting product's row, then
     * `confirm` runs against an order whose lines were inserted HIGH first.
     * If the loop followed insertion order it would block on HIGH immediately
     * and never touch LOW. If it follows `productId` order it takes LOW
     * first, then blocks. So "LOW is locked while `confirm` is blocked" IS
     * the ordering property, and nothing else produces it.
     */
    it('locks the lower-sorting product first even when its line was inserted second', async () => {
      const { category, warehouse, customer } = await seedFixtures();
      const productA = await productRepository.create({
        name: 'Molinillo',
        description: 'desc',
        price: { minorUnits: 10000n, currency: 'USD' },
        cost: { minorUnits: 6000n, currency: 'USD' },
        categoryId: category.id,
        image: 'a.png',
        order: 2,
      });
      const productB = await productRepository.create({
        name: 'Prensa',
        description: 'desc',
        price: { minorUnits: 10000n, currency: 'USD' },
        cost: { minorUnits: 6000n, currency: 'USD' },
        categoryId: category.id,
        image: 'b.png',
        order: 3,
      });
      // Both ids are random uuids, so which one sorts first is decided here,
      // not assumed.
      const [lowProductId, highProductId] = [productA.id, productB.id].sort();
      await stockIn(lowProductId, warehouse.id, 100);
      await stockIn(highProductId, warehouse.id, 100);

      const line = (productId: string) => ({
        productId,
        productName: productId === productA.id ? productA.name : productB.name,
        categoryName: 'Cafeteras',
        price: money(10000n, 'USD'),
        quantity: 1,
      });
      const created = await repository.create(
        createOrder(
          {
            customerId: customer.id,
            customerName: customer.fullName,
            warehouseId: warehouse.id,
            deliveryMode: 'pickup',
            attributedCompanyUserId,
            // HIGH first: insertion order is deliberately the OPPOSITE of
            // productId order, so the two orderings are distinguishable.
            lines: [line(highProductId), line(lowProductId)],
            payments: [{ channel: 'ZELLE', amount: money(20000n, 'USD') }],
          },
          [],
          AT,
        ),
      );

      const client = tenantContext.getClient();
      const lowRow = await client.stockLevel.findFirstOrThrow({
        where: { productId: lowProductId, warehouseId: warehouse.id },
      });
      const highRow = await client.stockLevel.findFirstOrThrow({
        where: { productId: highProductId, warehouseId: warehouse.id },
      });

      let releaseHolder!: () => void;
      const holderMayFinish = new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });
      const holder = client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT "id" FROM "stock_level" WHERE "id" = ${highRow.id}::uuid FOR UPDATE`;
        await holderMayFinish;
      }, LOCK_TRANSACTION_BUDGET);

      try {
        expect(await waitUntil(() => rowIsLocked(client, 'stock_level', highRow.id))).toBe(true);

        const confirming = repository.confirm(created.id);

        // THE assertion. False here means `confirm` blocked on HIGH without
        // ever having taken LOW — i.e. it walked the lines in insertion
        // order, and two such transitions can deadlock.
        expect(await waitUntil(() => rowIsLocked(client, 'stock_level', lowRow.id))).toBe(true);

        releaseHolder();
        await holder;
        await expect(confirming).resolves.toMatchObject({ status: 'verified' });
      } finally {
        releaseHolder();
        await holder.catch(() => undefined);
      }
    }, 40_000);
  });
});
