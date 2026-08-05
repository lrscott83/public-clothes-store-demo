import { randomUUID } from 'node:crypto';
import { seedOrders } from './seed.js';
import { seedWarehouses } from '../inventory/seed.js';
import { seedCustomers } from '../customer/seed.js';
import { grantTenantRole } from '../company/grant-tenant-role.js';
import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaMembershipRepository } from '../company/prisma-membership.repository.js';
import { useTenantSchema } from '../tenant-schema.spec-helper.js';

/**
 * Real Postgres, against a provisioned tenant schema (task 5.1). Covers the
 * spec's demo-seed idempotency requirement: re-running never duplicates the
 * 4 demo orders (single-currency, mixed USD/MN, split-payment, credit
 * sale), and the set spans `created`/`verified`/`delivered` across itself.
 * `seedOrders` no longer provisions its own warehouse/customer/agent
 * fixtures (task 14.2 reshape) — this suite seeds them directly, the same
 * way `prisma/seed.js`'s orchestration does.
 */
describe('seedOrders', () => {
  const getTenantSchema = useTenantSchema();
  const masterPrisma = new PrismaMasterService();
  const membershipRepository = new PrismaMembershipRepository(masterPrisma);
  let companyId: string;
  let salesAgentCompanyUserId: string;

  beforeAll(async () => {
    await masterPrisma.$connect();
  });

  beforeEach(async () => {
    const company = await masterPrisma.company.create({
      data: { name: 'Tienda Prueba', slug: `sales-seed-${randomUUID()}` },
    });
    companyId = company.id;

    const { client } = getTenantSchema();
    await seedWarehouses(client);
    await seedCustomers(masterPrisma, membershipRepository, client, companyId);
    const agentUser = await masterPrisma.user.create({
      data: { login: `sales.agent.${randomUUID()}`, passwordHash: 'x', fullName: 'Gestor de Ventas' },
    });
    const { companyUserId } = await grantTenantRole(membershipRepository, client, {
      userId: agentUser.id,
      companyId,
      role: 32,
      createdByCompanyUserId: null,
    });
    salesAgentCompanyUserId = companyUserId;
  });

  afterEach(async () => {
    const { client } = getTenantSchema();
    await client.commissionPayment.deleteMany({});
    await client.commissionAccrual.deleteMany({});
    await client.productCommissionReference.deleteMany({});
    await client.orderPayment.deleteMany({});
    await client.saleCredit.deleteMany({});
    await client.orderLine.deleteMany({});
    await client.order.deleteMany({});
    await client.exchangeRate.deleteMany({});
    await client.stockMovement.deleteMany({});
    await client.stockLevel.deleteMany({});
    await client.product.deleteMany({});
    await client.category.deleteMany({});
    await client.customer.deleteMany({});
    await client.companyUser.deleteMany({});
    await client.warehouse.deleteMany({});
    await masterPrisma.membership.deleteMany({});
    await masterPrisma.user.deleteMany({});
    await masterPrisma.company.deleteMany({});
  });

  afterAll(async () => {
    await masterPrisma.$disconnect();
  });

  it('creates the 4 demo orders spanning created/verified/delivered', async () => {
    const { client } = getTenantSchema();
    const result = await seedOrders(client, salesAgentCompanyUserId);

    expect(result.ordersUpserted).toBe(4);

    const orders = await client.order.findMany({ where: { customerName: { not: '' } } });
    const statuses = new Set(orders.map((o) => o.status));
    expect(statuses.has('created')).toBe(true);
    expect(statuses.has('verified')).toBe(true);
    expect(statuses.has('delivered')).toBe(true);
  });

  it('is idempotent: running twice never duplicates the demo orders', async () => {
    const { client } = getTenantSchema();
    const first = await seedOrders(client, salesAgentCompanyUserId);
    const ordersAfterFirst = await client.order.count();

    const second = await seedOrders(client, salesAgentCompanyUserId);
    const ordersAfterSecond = await client.order.count();

    expect(second.ordersUpserted).toBe(0);
    expect(ordersAfterSecond).toBe(ordersAfterFirst);
    expect(first.ordersUpserted).toBe(4);
  });

  it('attributes EVERY demo order to the cockpit sales agent — none left unattributed', async () => {
    const { client } = getTenantSchema();
    await seedOrders(client, salesAgentCompanyUserId);

    const orders = await client.order.findMany();

    // "Every", not "at least one": a seed that leaves some orders null would
    // still look healthy here while failing Phase 5's accrual gate later.
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(order.attributedCompanyUserId).toBe(salesAgentCompanyUserId);
    }
  });

  it('the credit-sale demo order carries an attached SaleCredit', async () => {
    const { client } = getTenantSchema();
    await seedOrders(client, salesAgentCompanyUserId);

    const saleCredit = await client.saleCredit.findFirst();
    expect(saleCredit).not.toBeNull();
    expect(Number(saleCredit?.paid.toString())).toBe(0);
  });
});
