import { createHash } from 'node:crypto';
import { createOrder, money, rateFromDecimalString, type ExchangeRate } from '@store-mgmt/domain';
import type { PrismaService } from '../prisma-client.js';
import type { TenantContextService } from '../tenant/tenant-context.service.js';
import { seedWarehouses } from '../inventory/seed.js';
import { seedCustomers } from '../customer/seed.js';
import { seedUsers, SALES_AGENT_LOGIN } from '../users/seed.js';
import { PrismaOrderRepository } from './prisma-order.repository.js';

/**
 * Fixed, arbitrary namespace UUID for deriving deterministic Sales-seed ids
 * (RFC 4122 UUID v5) — mirrors `product/seed.ts`'s `PRODUCT_SEED_NAMESPACE`
 * pattern, own namespace so the two never collide. Never reused for any
 * other purpose.
 */
const SALES_SEED_NAMESPACE = '3f0a6c9e-6e0a-4a7d-9a52-2c9d4a5f7b41';

function deterministicId(key: string): string {
  const namespaceBytes = Buffer.from(SALES_SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  // The 'ventas-seed:' prefix below is a fixed hash salt, not an identifier —
  // it must NEVER change. It is concatenated with the namespace bytes and
  // SHA-1'd to derive the RFC-4122 v5 UUID for every seeded demo order,
  // product and sale-credit. Renaming it would re-derive every id, so the
  // next seed run would upsert nothing and instead create a full duplicate
  // of the demo dataset while orphaning the originals.
  const nameBytes = Buffer.from(`ventas-seed:${key}`, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes, nameBytes])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const DEMO_CATEGORY_SLUG = 'sales-seed-demo';
const DEMO_PRODUCT_USD_ID = deterministicId('product:usd');
const DEMO_PRODUCT_MN_ID = deterministicId('product:mn');
const DEMO_MN_RATE_CHANNEL = 'MN_TRANSFER' as const;

export interface SeedOrdersResult {
  readonly ordersUpserted: number;
}

/**
 * Idempotent seed of 4 demo `Order`s — single-currency (USD, `created`),
 * mixed USD/MN (`verified`), split-payment (two channels, `delivered`),
 * and a credit sale (`created`) — spanning `created`/`verified`/`delivered`
 * across the set, keyed on deterministic ids (the "stable natural key",
 * mirroring `product/seed.ts`'s `deterministicProductId` pattern — `Order`
 * has no other natural unique key). Re-running never duplicates: each demo
 * order is looked up by its deterministic id first; if it already exists,
 * this function is a no-op for that slot.
 *
 * REUSES `PrismaOrderRepository` (not raw Prisma inserts) so every seeded
 * order goes through the SAME `createOrder()` factory + `confirm`/`deliver`
 * transitions the real app uses — the seeded `stock_level` rows end up
 * referentially consistent with the orders' real reserve/consume effects
 * (unlike a hand-set `status` column, which would leave stock untouched).
 *
 * CREDIT-SALE INVARIANT TENSION (flagged, not silently resolved — see
 * apply-progress): `createOrder` enforces `Σ amountInOrderCurrency ===
 * total` UNCONDITIONALLY, including for a would-be credit-only order
 * (`payments=[]``), which would need `total=0` to pass. Domain is FROZEN
 * this phase (do not loosen the invariant). This seed's credit-sale demo
 * order therefore carries a real payment that balances `total` (required to
 * satisfy the current factory contract) AND an attached `SaleCredit` for
 * the SAME amount with `paid=0` — `SaleCredit.paid`/`.total` are NOT
 * cross-validated against `Order`/`OrderPayment` anywhere in `createOrder`,
 * so this is not a hack around a real invariant, just the only shape the
 * current domain lets a "credit sale" seed row take. A future domain change
 * (out of scope this phase) would exempt credit-only orders from the
 * payment-sum check so `payments` can be genuinely empty.
 */
export async function seedOrders(prisma: PrismaService): Promise<SeedOrdersResult> {
  await seedWarehouses(prisma);
  await seedCustomers(prisma);
  // Demo orders are attributed to the cockpit `sales_agent`, so the seeded
  // dataset carries the same attribution a real sale would. `findFirstOrThrow`
  // rather than a null-tolerant lookup on purpose: a seed that silently wrote
  // unattributed orders would look fine and then fail Phase 5's accrual gate
  // with no clue why.
  await seedUsers(prisma);
  const salesAgentUser = await prisma.user.findUniqueOrThrow({ where: { login: SALES_AGENT_LOGIN } });
  const salesAgentAssignment = await prisma.companyUser.findFirstOrThrow({
    where: { userId: salesAgentUser.id, status: 'ACTIVE' },
  });
  const salesAgentCompanyUserId = salesAgentAssignment.id;

  const warehouse = await prisma.warehouse.findFirstOrThrow({ orderBy: { name: 'asc' } });
  const customers = await prisma.customer.findMany({ orderBy: { fullName: 'asc' }, take: 2 });
  const customer = customers[0]!;
  const secondCustomer = customers[1] ?? customer;

  const category = await prisma.category.upsert({
    where: { slug: DEMO_CATEGORY_SLUG },
    update: {},
    create: { name: 'Ventas Demo', slug: DEMO_CATEGORY_SLUG, order: 999, active: true },
  });

  const productUsd = await prisma.product.upsert({
    where: { id: DEMO_PRODUCT_USD_ID },
    update: {},
    create: {
      id: DEMO_PRODUCT_USD_ID,
      name: 'Producto Demo USD',
      description: 'Ventas seed demo product (USD)',
      price: '100.00',
      priceCurrency: 'USD',
      cost: '60.00',
      costCurrency: 'USD',
      categoryId: category.id,
      image: 'sales-seed/demo-usd.png',
      order: 1,
      active: true,
    },
  });
  const productMn = await prisma.product.upsert({
    where: { id: DEMO_PRODUCT_MN_ID },
    update: {},
    create: {
      id: DEMO_PRODUCT_MN_ID,
      name: 'Producto Demo MN',
      description: 'Ventas seed demo product (MN)',
      price: '35000.00',
      priceCurrency: 'MN',
      cost: '21000.00',
      costCurrency: 'MN',
      categoryId: category.id,
      image: 'sales-seed/demo-mn.png',
      order: 2,
      active: true,
    },
  });

  const existingMnRate = await prisma.exchangeRate.findFirst({ where: { channel: DEMO_MN_RATE_CHANNEL } });
  if (!existingMnRate) {
    await prisma.exchangeRate.create({
      data: {
        channel: DEMO_MN_RATE_CHANNEL,
        rate: '350.000000',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      },
    });
  }
  const rateRows = await prisma.exchangeRate.findMany({
    where: { channel: DEMO_MN_RATE_CHANNEL },
    orderBy: { effectiveFrom: 'desc' },
  });
  const rates: ExchangeRate[] = rateRows.map((row) => ({
    id: row.id,
    channel: row.channel,
    rate: rateFromDecimalString(row.rate.toString()),
    effectiveFrom: row.effectiveFrom,
  }));

  // `seedOrders` is currently UNREACHABLE from `prisma/seed.js` (task 3.5's
  // "master only for now" — see that file's header comment); this fake keeps
  // `PrismaOrderRepository`'s constructor (task 6.2, `TenantContextService`)
  // satisfied at the type level without rewriting this whole function onto a
  // real tenant schema, which is Phase 9/14.2's job once seeding is wired
  // through the provisioning saga. Points `getClient()` straight at the same
  // `prisma` connection every other call in this function already uses, so
  // behavior is unchanged if this ever runs again before then.
  const repository = new PrismaOrderRepository({
    getClient: () => prisma,
  } as unknown as TenantContextService);
  const at = new Date('2026-07-22T00:00:00Z');
  let ordersUpserted = 0;

  // 1. Single-currency (USD), stays `created`.
  const singleCurrencyId = deterministicId('order:single-currency');
  if (!(await repository.findById(singleCurrencyId))) {
    const order = createOrder(
      {
        id: singleCurrencyId,
        customerId: customer.id,
        customerName: customer.fullName,
        attributedCompanyUserId: salesAgentCompanyUserId,
        warehouseId: warehouse.id,
        deliveryMode: 'pickup',
        lines: [
          {
            productId: productUsd.id,
            productName: productUsd.name,
            categoryName: category.name,
            price: money(10000n, 'USD'),
            quantity: 1,
          },
        ],
        payments: [{ channel: 'ZELLE', amount: money(10000n, 'USD') }],
      },
      [],
      at,
    );
    await repository.create(order);
    ordersUpserted++;
  }

  // 2. Mixed USD/MN, transitions to `verified` (reserves stock).
  const mixedId = deterministicId('order:mixed-currency');
  if (!(await repository.findById(mixedId))) {
    await ensureStock(prisma, productUsd.id, warehouse.id, 10);
    await ensureStock(prisma, productMn.id, warehouse.id, 10);
    const order = createOrder(
      {
        id: mixedId,
        customerId: customer.id,
        customerName: customer.fullName,
        attributedCompanyUserId: salesAgentCompanyUserId,
        warehouseId: warehouse.id,
        deliveryMode: 'pickup',
        lines: [
          {
            productId: productUsd.id,
            productName: productUsd.name,
            categoryName: category.name,
            price: money(10000n, 'USD'),
            quantity: 1,
          },
          {
            productId: productMn.id,
            productName: productMn.name,
            categoryName: category.name,
            price: money(3500000n, 'MN'),
            quantity: 1,
          },
        ],
        payments: [{ channel: 'ZELLE', amount: money(20000n, 'USD') }],
      },
      rates,
      at,
    );
    await repository.create(order);
    await repository.confirm(mixedId);
    ordersUpserted++;
  }

  // 3. Split-payment (two channels), transitions through to `delivered`
  //    (reserves then consumes stock).
  const splitPaymentId = deterministicId('order:split-payment');
  if (!(await repository.findById(splitPaymentId))) {
    await ensureStock(prisma, productUsd.id, warehouse.id, 10);
    const order = createOrder(
      {
        id: splitPaymentId,
        customerId: secondCustomer.id,
        customerName: secondCustomer.fullName,
        attributedCompanyUserId: salesAgentCompanyUserId,
        warehouseId: warehouse.id,
        deliveryMode: 'pickup',
        lines: [
          {
            productId: productUsd.id,
            productName: productUsd.name,
            categoryName: category.name,
            price: money(10000n, 'USD'),
            quantity: 2,
          },
        ],
        payments: [
          { channel: 'ZELLE', amount: money(12000n, 'USD') },
          { channel: 'MN_CASH', amount: money(2800000n, 'MN') }, // 80.00 USD @350
        ],
      },
      rates,
      at,
    );
    await repository.create(order);
    await repository.confirm(splitPaymentId);
    await repository.deliver(splitPaymentId);
    ordersUpserted++;
  }

  // 4. Credit sale, stays `created` — see CREDIT-SALE INVARIANT TENSION above.
  const creditSaleId = deterministicId('order:credit-sale');
  if (!(await repository.findById(creditSaleId))) {
    const order = createOrder(
      {
        id: creditSaleId,
        customerId: secondCustomer.id,
        customerName: secondCustomer.fullName,
        attributedCompanyUserId: salesAgentCompanyUserId,
        warehouseId: warehouse.id,
        deliveryMode: 'delivery',
        lines: [
          {
            productId: productUsd.id,
            productName: productUsd.name,
            categoryName: category.name,
            price: money(10000n, 'USD'),
            quantity: 1,
          },
        ],
        // Balances the factory's unconditional payment-sum invariant — see
        // CREDIT-SALE INVARIANT TENSION above. The real "amount owed" is
        // tracked by `saleCredit` below, independent of this payment.
        payments: [{ channel: 'ZELLE', amount: money(10000n, 'USD') }],
        saleCredit: {
          id: deterministicId('sale-credit:credit-sale'),
          orderId: creditSaleId,
          customerId: secondCustomer.id,
          total: money(10000n, 'USD'),
          paid: money(0n, 'USD'),
          rateApplied: { channel: 'ZELLE', rate: 1_000_000n, effectiveFrom: at },
          rateEffectiveFrom: at,
          createdAt: at,
          updatedAt: at,
        },
      },
      [],
      at,
    );
    await repository.create(order);
    ordersUpserted++;
  }

  return { ordersUpserted };
}

async function ensureStock(
  prisma: PrismaService,
  productId: string,
  warehouseId: string,
  minOnHand: number,
): Promise<void> {
  const level = await prisma.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  if (level && level.onHand >= minOnHand) return;

  const missing = minOnHand - (level?.onHand ?? 0);
  await prisma.$transaction(async (tx) => {
    const row = await tx.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      update: {},
      create: { productId, warehouseId, onHand: 0, reserved: 0 },
    });
    await tx.stockLevel.update({ where: { id: row.id }, data: { onHand: { increment: missing } } });
    await tx.stockMovement.create({
      data: { productId, warehouseId, type: 'purchase_in', quantity: missing },
    });
  });
}
