import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../prisma-client.js';

/** Bcrypt hash shape accepted by the domain `passwordHash` invariant — never a real credential. */
const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

export interface CommissionFixture {
  readonly companyUserId: string;
  readonly orderId: string;
  readonly orderLineId: string;
  readonly productId: string;
}

/**
 * Builds the minimum real graph an accrual needs: an agent assignment, a
 * product, and a delivered order with one line. Every FK in the commission
 * module is `RESTRICT`, so these rows have to genuinely exist — there is no
 * shortcut fixture that satisfies the schema without them.
 */
export async function seedCommissionFixture(
  prisma: PrismaService,
  categoryId: string,
): Promise<CommissionFixture> {
  const company = await prisma.company.upsert({
    where: { slug: 'default' },
    update: {},
    create: { name: 'Tienda Prueba', slug: 'default' },
  });
  const user = await prisma.user.create({
    data: { login: `spec.${randomUUID()}`, passwordHash: VALID_HASH, fullName: 'Gestor' },
  });
  const assignment = await prisma.companyUser.create({
    data: { userId: user.id, companyId: company.id, role: 32, status: 'ACTIVE' },
  });
  const customer = await prisma.customer.create({
    data: { fullName: `Cliente ${randomUUID()}`, userId: user.id },
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
 * Clears the three commission tables in reverse-FK order.
 *
 * EVERY suite that bulk-deletes products or orders must call this first, even
 * suites that have nothing to do with commissions. `product_commission_reference`
 * and `commission_accrual` both point at those tables with `RESTRICT`, so a
 * single leftover row — from a manual seed run against `store_mgmt_test`, or
 * from a suite that died before its own teardown — makes an unrelated
 * `product.deleteMany({})` fail with a foreign-key error naming a table that
 * spec never heard of. It looks like flakiness. It is contamination.
 *
 * The constraints are `RESTRICT` on purpose: a commission reference is
 * configuration and an accrual is money someone earned, and neither should
 * vanish because a row upstream was deleted. Cleaning up explicitly is the
 * price of that guarantee.
 */
export async function wipeCommissionTables(prisma: PrismaService): Promise<void> {
  await prisma.commissionPayment.deleteMany({});
  await prisma.commissionAccrual.deleteMany({});
  await prisma.productCommissionReference.deleteMany({});
}

/**
 * Tears the graph down in reverse-FK order. Every commission FK is `RESTRICT`
 * except the accrual's own children, and `sales_order.attributed_company_user_id`
 * is `RESTRICT` too — so payments go before accruals, accruals before orders,
 * and orders before company users. A bulk wipe in the wrong order fails loudly,
 * which is the constraint doing its job rather than a nuisance to work around.
 *
 * Products are scoped to `categoryId`: this suite's own. Deleting every product
 * would take out rows that other suites' stock levels still reference, turning
 * one spec's cleanup into another spec's FK error.
 */
export async function wipeCommissionFixture(
  prisma: PrismaService,
  categoryId: string,
): Promise<void> {
  await wipeCommissionTables(prisma);
  await prisma.orderLine.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.stockLevel.deleteMany({ where: { product: { categoryId } } });
  await prisma.stockMovement.deleteMany({ where: { product: { categoryId } } });
  await prisma.product.deleteMany({ where: { categoryId } });
  // Only the warehouses this suite created — they are exactly the ones left
  // holding no stock and no orders. Wiping every warehouse would break the FK
  // from stock levels that belong to other suites' products.
  await prisma.warehouse.deleteMany({
    where: { stockLevels: { none: {} }, movements: { none: {} }, orders: { none: {} } },
  });
  await prisma.customer.deleteMany({});
  await prisma.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
  await prisma.companyUser.deleteMany({});
  await prisma.user.deleteMany({});
}
