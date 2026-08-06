import { assignCarrier } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCarrierRepository } from './prisma-carrier.repository.js';
import { PrismaDeliveryAssignmentRepository } from './prisma-delivery-assignment.repository.js';
import {
  seedDeliveryFixtureBase,
  createDeliveryOrderFixture,
  wipeDeliveryFixture,
  type DeliveryFixtureBase,
} from './delivery-fixtures.spec-helper.js';

/**
 * Real Postgres, against a provisioned tenant schema. Covers the `orderId`
 * UNIQUE guarantee (D1), the nullable `findByOrderId` (never throws), the
 * `list` filter, and `countOrdersAwaitingCarrier`'s anti-join — the property
 * the whole "orders awaiting a carrier" read depends on (design §4).
 */
describe('PrismaDeliveryAssignmentRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let carrierRepository: PrismaCarrierRepository;
  let repository: PrismaDeliveryAssignmentRepository;
  let base: DeliveryFixtureBase;
  let carrierId: string;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    carrierRepository = new PrismaCarrierRepository(tenantContext);
    repository = new PrismaDeliveryAssignmentRepository(tenantContext);
  });

  beforeEach(async () => {
    base = await seedDeliveryFixtureBase(tenantContext.getClient());
    const carrier = await carrierRepository.create({ name: 'Assignment Carrier' });
    carrierId = carrier.id;
  });

  afterEach(async () => {
    await wipeDeliveryFixture(tenantContext.getClient());
  });

  async function verifiedDeliveryOrder(): Promise<string> {
    const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
      deliveryMode: 'delivery',
      status: 'verified',
    });
    return orderId;
  }

  it('creates an assignment and round-trips it by id', async () => {
    const orderId = await verifiedDeliveryOrder();
    const assignment = assignCarrier({ orderId, carrierId }, new Date('2026-08-01T10:00:00.000Z'));

    const created = await repository.create(assignment);

    expect(created.status).toBe('in_transit');
    expect(created.deliveredAt).toBeNull();
    const reread = await repository.findById(created.id);
    expect(reread!.orderId).toBe(orderId);
    expect(reread!.carrierId).toBe(carrierId);
  });

  it('rejects a duplicate orderId — the UNIQUE index is the guarantee', async () => {
    const orderId = await verifiedDeliveryOrder();
    const at = new Date('2026-08-01T10:00:00.000Z');
    await repository.create(assignCarrier({ orderId, carrierId }, at));

    const secondCarrier = await carrierRepository.create({ name: 'Second Carrier' });
    await expect(
      repository.create(assignCarrier({ orderId, carrierId: secondCarrier.id }, at)),
    ).rejects.toThrow();
  });

  it('findByOrderId returns null for a pickup/no-assignment order — never throws', async () => {
    const { orderId } = await createDeliveryOrderFixture(tenantContext.getClient(), base, {
      deliveryMode: 'pickup',
      status: 'delivered',
    });

    await expect(repository.findByOrderId(orderId)).resolves.toBeNull();
  });

  describe('list', () => {
    it('filters by carrierId', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const orderIdA = await verifiedDeliveryOrder();
      const orderIdB = await verifiedDeliveryOrder();
      const otherCarrier = await carrierRepository.create({ name: 'Other Carrier' });
      const mine = await repository.create(assignCarrier({ orderId: orderIdA, carrierId }, at));
      await repository.create(assignCarrier({ orderId: orderIdB, carrierId: otherCarrier.id }, at));

      const scoped = await repository.list({ carrierId });

      expect(scoped.map((a) => a.id)).toEqual([mine.id]);
    });

    it('filters by status', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const orderIdA = await verifiedDeliveryOrder();
      const orderIdB = await verifiedDeliveryOrder();
      await repository.create(assignCarrier({ orderId: orderIdA, carrierId }, at));
      const delivered = await tenantContext.getClient().deliveryAssignment.create({
        data: {
          orderId: orderIdB,
          carrierId,
          status: 'delivered',
          assignedAt: at,
          deliveredAt: new Date('2026-08-02T10:00:00.000Z'),
        },
      });

      const inTransit = await repository.list({ status: 'in_transit' });
      const delivered_ = await repository.list({ status: 'delivered' });

      expect(inTransit.map((a) => a.orderId)).toEqual([orderIdA]);
      expect(delivered_.map((a) => a.id)).toEqual([delivered.id]);
    });

    it('returns everything when no filter is given', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      const orderIdA = await verifiedDeliveryOrder();
      const orderIdB = await verifiedDeliveryOrder();
      await repository.create(assignCarrier({ orderId: orderIdA, carrierId }, at));
      await repository.create(assignCarrier({ orderId: orderIdB, carrierId }, at));

      expect(await repository.list()).toHaveLength(2);
    });
  });

  describe('countOrdersAwaitingCarrier', () => {
    it('counts only verified + delivery-mode + no-assignment orders (the anti-join)', async () => {
      const at = new Date('2026-08-01T10:00:00.000Z');
      // 2 orders that SHOULD count: verified, delivery, no assignment.
      await verifiedDeliveryOrder();
      await verifiedDeliveryOrder();
      // 1 order that must NOT count: verified, delivery, but already assigned.
      const assignedOrderId = await verifiedDeliveryOrder();
      await repository.create(assignCarrier({ orderId: assignedOrderId, carrierId }, at));
      // 1 order that must NOT count: pickup mode.
      await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'pickup',
        status: 'verified',
      });
      // 1 order that must NOT count: delivery mode but not verified yet.
      await createDeliveryOrderFixture(tenantContext.getClient(), base, {
        deliveryMode: 'delivery',
        status: 'created',
      });

      expect(await repository.countOrdersAwaitingCarrier()).toBe(2);
    });
  });
});
