import { randomUUID } from 'node:crypto';
import type { OrderStatus } from '@store-mgmt/domain';
import type { PrismaClient } from '../../generated/tenant/client.js';

/**
 * Base graph every Delivery repository spec needs: a warehouse, a customer,
 * an attributing `CompanyUser`, and a product to hang order lines off of —
 * directly against a real PROVISIONED TENANT SCHEMA (mirrors
 * `commission-fixtures.spec-helper.ts`'s `seedCommissionFixture`).
 *
 * Raw `prisma.<model>.create` calls, not the repository classes — this
 * helper only needs the tenant CLIENT, so it stays self-contained and does
 * not depend on `PrismaCarrierRepository`/`PrismaDeliveryAssignmentRepository`
 * being correct to build a fixture for testing them.
 */
export interface DeliveryFixtureBase {
  readonly companyUserId: string;
  readonly customerId: string;
  readonly warehouseId: string;
  readonly productId: string;
  readonly categoryId: string;
}

export async function seedDeliveryFixtureBase(prisma: PrismaClient): Promise<DeliveryFixtureBase> {
  const category = await prisma.category.upsert({
    where: { slug: 'delivery-spec' },
    update: {},
    create: { name: 'Delivery Spec', slug: 'delivery-spec', order: 902, active: true },
  });
  const companyUser = await prisma.companyUser.create({ data: { id: randomUUID(), role: 32 } });
  const customer = await prisma.customer.create({
    data: { fullName: `Cliente ${randomUUID()}`, companyUserId: companyUser.id },
  });
  const warehouse = await prisma.warehouse.create({ data: { name: `Almacén ${randomUUID()}` } });
  const product = await prisma.product.create({
    data: {
      name: `Producto ${randomUUID()}`,
      description: 'delivery spec fixture',
      price: '1000.00',
      priceCurrency: 'MN',
      cost: '500.00',
      costCurrency: 'MN',
      categoryId: category.id,
      image: 'delivery-spec.png',
      order: 1,
    },
  });

  return {
    companyUserId: companyUser.id,
    customerId: customer.id,
    warehouseId: warehouse.id,
    productId: product.id,
    categoryId: category.id,
  };
}

export interface CreateDeliveryOrderInput {
  readonly deliveryMode: 'pickup' | 'delivery';
  readonly status: OrderStatus;
}

/**
 * Creates a real `sales_order` row (with one line) at an arbitrary
 * `status`/`deliveryMode` pair — a raw insert, not a walk through
 * `OrderService`'s real transitions, since `countOrdersAwaitingCarrier`'s
 * anti-join spec (task 3.5) needs a `verified` order to simply EXIST, not to
 * have been legitimately reserved/verified through the whole Sales flow.
 */
export async function createDeliveryOrderFixture(
  prisma: PrismaClient,
  base: DeliveryFixtureBase,
  input: CreateDeliveryOrderInput,
): Promise<{ orderId: string }> {
  const order = await prisma.order.create({
    data: {
      customerId: base.customerId,
      customerName: `Cliente ${randomUUID()}`,
      warehouseId: base.warehouseId,
      deliveryMode: input.deliveryMode,
      currency: 'MN',
      status: input.status,
      subtotal: '1000.00',
      discountTotal: '0.00',
      total: '1000.00',
      orderDate: new Date(),
      attributedCompanyUserId: base.companyUserId,
      lines: {
        create: [
          {
            productId: base.productId,
            productName: 'Producto delivery spec',
            categoryName: 'Delivery Spec',
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
  });

  return { orderId: order.id };
}

/**
 * Tears down everything a Delivery repository spec might have created, in
 * reverse-FK order. Safe as an UNSCOPED wipe (unlike
 * `wipeCommissionFixture`'s category-scoped version) because
 * `useTenantSchema()` provisions one schema PER SUITE — nothing else in the
 * schema exists for this to accidentally destroy.
 */
export async function wipeDeliveryFixture(prisma: PrismaClient): Promise<void> {
  await prisma.deliveryAssignment.deleteMany({});
  await prisma.carrierWarehouse.deleteMany({});
  await prisma.carrier.deleteMany({});
  await prisma.orderLine.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.stockLevel.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.companyUser.deleteMany({});
}
