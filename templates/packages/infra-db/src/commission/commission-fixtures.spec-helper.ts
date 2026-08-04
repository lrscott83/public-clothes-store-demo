import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/tenant/client.js';

export interface CommissionFixture {
  readonly companyUserId: string;
  readonly orderId: string;
  readonly orderLineId: string;
  readonly productId: string;
}

/**
 * Builds the minimum real graph an accrual needs: an agent assignment, a
 * product, and a delivered order with one line — directly against a real
 * PROVISIONED TENANT SCHEMA (design.md §4, P12 Option C; task 6.2), not the
 * shared master `public` schema this helper used before. Every FK in the
 * commission module is `RESTRICT`, so these rows have to genuinely exist —
 * there is no shortcut fixture that satisfies the schema without them.
 *
 * Raw `prisma.<model>.create` calls, not the repository classes — deliberate
 * (mirrors `prisma-order.repository.spec.ts`'s pre-6.3 fixture seam): this
 * helper only needs the tenant CLIENT, so it stays self-contained without
 * waiting on Category/Product/Warehouse/Order repos to be re-sourced. There
 * is no master `Company`/`User` fixture anymore — the tenant `CompanyUser`
 * this reshape produces (design.md D1: `id`, `role`, `createdByCompanyUserId`
 * only) has no cross-schema FK to satisfy; its `id` stands in for "the
 * master `User.id` it represents" without a real master row needing to
 * exist.
 */
export async function seedCommissionFixture(
  prisma: PrismaClient,
  categoryId: string,
): Promise<CommissionFixture> {
  const assignment = await prisma.companyUser.create({ data: { id: randomUUID(), role: 32 } });
  const customer = await prisma.customer.create({
    data: { fullName: `Cliente ${randomUUID()}`, companyUserId: assignment.id },
  });
  const warehouse = await prisma.warehouse.create({ data: { name: `Almacén ${randomUUID()}` } });
  const product = await prisma.product.create({
    data: {
      name: `Producto ${randomUUID()}`,
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

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      customerName: customer.fullName,
      warehouseId: warehouse.id,
      deliveryMode: 'pickup',
      currency: 'MN',
      status: 'delivered',
      subtotal: '1000.00',
      discountTotal: '0.00',
      total: '1000.00',
      orderDate: new Date(),
      attributedCompanyUserId: assignment.id,
      lines: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            categoryName: 'Commission Spec',
            price: '1000.00',
            priceCurrency: 'MN',
            quantity: 1,
            unitFinalPrice: '1000.00',
            lineTotalNative: '1000.00',
            rateApplied: '1.000000',
            rateChannel: 'MN_CASH',
            rateEffectiveFrom: new Date(),
            lineTotalOrder: '1000.00',
          },
        ],
      },
    },
    include: { lines: true },
  });

  return {
    companyUserId: assignment.id,
    orderId: order.id,
    orderLineId: order.lines[0]!.id,
    productId: product.id,
  };
}

/**
 * Tears the graph down in reverse-FK order, against the same tenant client.
 * `categoryId` scopes the product wipe — this suite's own — since one
 * tenant schema is shared by the whole describe block (created once in
 * `beforeAll` by `useTenantSchema()`), so rows accumulate across tests
 * unless wiped here. Unlike the pre-6.2 shared-`public` version, this no
 * longer needs to protect OTHER suites' data (each suite gets its own
 * schema) — only tests WITHIN this one suite.
 */
export async function wipeCommissionFixture(prisma: PrismaClient, categoryId: string): Promise<void> {
  await prisma.commissionPayment.deleteMany({});
  await prisma.commissionAccrual.deleteMany({});
  await prisma.productCommissionReference.deleteMany({});
  await prisma.orderLine.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.stockLevel.deleteMany({ where: { product: { categoryId } } });
  await prisma.stockMovement.deleteMany({ where: { product: { categoryId } } });
  await prisma.product.deleteMany({ where: { categoryId } });
  await prisma.warehouse.deleteMany({
    where: { stockLevels: { none: {} }, movements: { none: {} }, orders: { none: {} } },
  });
  await prisma.customer.deleteMany({});
  await prisma.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
  await prisma.companyUser.deleteMany({});
}
