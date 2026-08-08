import { randomUUID } from 'node:crypto';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import {
  createDeliveryOrderFixture,
  seedDeliveryFixtureBase,
  wipeDeliveryFixture,
  type DeliveryFixtureBase,
} from './delivery-fixtures.spec-helper.js';
import { closeAssignmentOnDeliveryTx } from './close-assignment-on-delivery.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema — same discipline as `apply-reservation.spec.ts`, which this file
 * mirrors: the helper is exercised through a real `prisma.$transaction`,
 * never mocked. This is Direction B (Sales -> Delivery, design.md §2B) in
 * isolation, BEFORE it is wired into `PrismaOrderRepository.deliver`
 * (task 5.4) — `prisma-order.repository.spec.ts` covers the wired,
 * whole-transaction rollback case separately (task 5.3).
 */
describe('closeAssignmentOnDeliveryTx', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let base: DeliveryFixtureBase;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
  });

  beforeEach(async () => {
    base = await seedDeliveryFixtureBase(tenantContext.getClient());
  });

  afterEach(async () => {
    await wipeDeliveryFixture(tenantContext.getClient());
  });

  async function seedCarrier() {
    return tenantContext.getClient().carrier.create({ data: { name: `Transportes ${randomUUID()}` } });
  }

  it('closes an in_transit assignment to delivered, stamping deliveredAt', async () => {
    const prisma = tenantContext.getClient();
    const { orderId } = await createDeliveryOrderFixture(prisma, base, {
      deliveryMode: 'delivery',
      status: 'verified',
    });
    const carrier = await seedCarrier();
    const assignment = await prisma.deliveryAssignment.create({
      data: { orderId, carrierId: carrier.id, status: 'in_transit', assignedAt: new Date() },
    });

    await prisma.$transaction((tx) => closeAssignmentOnDeliveryTx(tx, orderId));

    const reloaded = await prisma.deliveryAssignment.findUnique({ where: { id: assignment.id } });
    expect(reloaded?.status).toBe('delivered');
    expect(reloaded?.deliveredAt).not.toBeNull();
  });

  it('leaves an already-delivered assignment untouched — idempotent 0-row update, not an error', async () => {
    const prisma = tenantContext.getClient();
    const { orderId } = await createDeliveryOrderFixture(prisma, base, {
      deliveryMode: 'delivery',
      status: 'delivered',
    });
    const carrier = await seedCarrier();
    const deliveredAt = new Date('2026-01-01T00:00:00Z');
    const assignment = await prisma.deliveryAssignment.create({
      data: {
        orderId,
        carrierId: carrier.id,
        status: 'delivered',
        assignedAt: new Date('2025-12-01T00:00:00Z'),
        deliveredAt,
      },
    });

    await expect(prisma.$transaction((tx) => closeAssignmentOnDeliveryTx(tx, orderId))).resolves.toBeUndefined();

    const reloaded = await prisma.deliveryAssignment.findUnique({ where: { id: assignment.id } });
    expect(reloaded?.status).toBe('delivered');
    expect(reloaded?.deliveredAt?.toISOString()).toBe(deliveredAt.toISOString());
  });

  it('affects 0 rows and never throws for an order with no assignment (pickup, or legacy delivered)', async () => {
    const prisma = tenantContext.getClient();
    const { orderId } = await createDeliveryOrderFixture(prisma, base, {
      deliveryMode: 'pickup',
      status: 'delivered',
    });

    // No `deliveryAssignment` row exists for this order at all — the
    // guarded UPDATE's `WHERE` clause simply matches nothing. Never
    // `findUniqueOrThrow`; this must resolve cleanly, not reject.
    await expect(prisma.$transaction((tx) => closeAssignmentOnDeliveryTx(tx, orderId))).resolves.toBeUndefined();
  });
});
