import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { schemaNameFor } from '../tenant/schema-name.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { TenantPrismaFactory } from '../tenant/tenant-prisma-factory.js';
import { fakeTenantContext, useTenantSchema } from '../tenant-schema.spec-helper.js';
import {
  createDeliveryOrderFixture,
  seedDeliveryFixtureBase,
  wipeDeliveryFixture,
  type DeliveryFixtureBase,
} from './delivery-fixtures.spec-helper.js';
import { cancelAssignmentOnOrderCancelTx } from './cancel-assignment-on-order-cancel.js';

/**
 * Mirror of `close-assignment-on-delivery.spec.ts`, for the OTHER terminal
 * edge of Direction B (Sales -> Delivery). Real per-suite tenant schema, real
 * `$transaction`, never mocked.
 *
 * The bug this closes: before `cancelled` existed, cancelling an assigned
 * order left its assignment `in_transit` FOREVER — the carrier read BUSY in
 * `computeCarrierCapacity` and no API path could close it, because
 * `markDelivered` on a cancelled order throws `InvalidOrderStateError`.
 * Recovery required manual SQL.
 */
describe('cancelAssignmentOnOrderCancelTx', () => {
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

  it('closes an in_transit assignment to cancelled, leaving deliveredAt null', async () => {
    const prisma = tenantContext.getClient();
    const { orderId } = await createDeliveryOrderFixture(prisma, base, {
      deliveryMode: 'delivery',
      status: 'verified',
    });
    const carrier = await seedCarrier();
    const assignment = await prisma.deliveryAssignment.create({
      data: { orderId, carrierId: carrier.id, status: 'in_transit', assignedAt: new Date() },
    });

    await prisma.$transaction((tx) => cancelAssignmentOnOrderCancelTx(tx, orderId));

    const reloaded = await prisma.deliveryAssignment.findUnique({ where: { id: assignment.id } });
    expect(reloaded?.status).toBe('cancelled');
    // NEVER stamped: a cancellation is not a delivery, and stamping it would
    // be indistinguishable from one for anything reading `delivered_at`.
    expect(reloaded?.deliveredAt).toBeNull();
  });

  it('leaves an already-delivered assignment untouched — a delivered order is not cancellable anyway', async () => {
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

    await expect(
      prisma.$transaction((tx) => cancelAssignmentOnOrderCancelTx(tx, orderId)),
    ).resolves.toBeUndefined();

    const reloaded = await prisma.deliveryAssignment.findUnique({ where: { id: assignment.id } });
    expect(reloaded?.status).toBe('delivered');
    expect(reloaded?.deliveredAt?.toISOString()).toBe(deliveredAt.toISOString());
  });

  it('is idempotent on an already-cancelled assignment — 0 rows, not an error', async () => {
    const prisma = tenantContext.getClient();
    const { orderId } = await createDeliveryOrderFixture(prisma, base, {
      deliveryMode: 'delivery',
      status: 'cancelled',
    });
    const carrier = await seedCarrier();
    const assignment = await prisma.deliveryAssignment.create({
      data: { orderId, carrierId: carrier.id, status: 'cancelled', assignedAt: new Date() },
    });

    await expect(
      prisma.$transaction((tx) => cancelAssignmentOnOrderCancelTx(tx, orderId)),
    ).resolves.toBeUndefined();

    const reloaded = await prisma.deliveryAssignment.findUnique({ where: { id: assignment.id } });
    expect(reloaded?.status).toBe('cancelled');
  });

  it('affects 0 rows and never throws for an order with no assignment (pickup, or never assigned)', async () => {
    const prisma = tenantContext.getClient();
    const { orderId } = await createDeliveryOrderFixture(prisma, base, {
      deliveryMode: 'pickup',
      status: 'created',
    });

    await expect(
      prisma.$transaction((tx) => cancelAssignmentOnOrderCancelTx(tx, orderId)),
    ).resolves.toBeUndefined();
  });

  /**
   * CLASS F1 — a schema change is not shipped until every tenant has it.
   *
   * Tenant schemas only evolve through a MANUAL, out-of-band
   * `node scripts/tenant-migrate.ts`. Between deploying this code and running
   * that fleet migration, every tenant still has the two-value
   * `DeliveryAssignmentStatus` enum. A literal `'cancelled'::"..."` cast is
   * resolved by Postgres at PLAN time, so it raised `invalid input value for
   * enum` whether or not any row matched — turning `POST /orders/:id/cancel`
   * into a 500 that rolled back for EVERY order in an un-migrated tenant:
   * pickup orders, unassigned orders, `created` orders, all of them. That put
   * a hard dependency on new DDL onto the hot path of a pre-existing Sales
   * endpoint.
   *
   * The regular suites cannot see this: `useTenantSchema()` provisions from
   * the freshly regenerated `tenant-schema.sql`, which always has the new
   * value. So this block builds a genuinely PRE-migration schema by hand.
   */
  describe('tolerance for a tenant whose enum has not been migrated yet', () => {
    const factory = new TenantPrismaFactory();
    let legacySchema: string;

    beforeAll(async () => {
      legacySchema = schemaNameFor(randomUUID());
      const pg = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
      await pg.connect();
      try {
        await pg.query(`CREATE SCHEMA "${legacySchema}"`);
        await pg.query(`SET search_path TO "${legacySchema}"`);
        // The PRE-migration enum: two values, no `cancelled`.
        await pg.query(`CREATE TYPE "DeliveryAssignmentStatus" AS ENUM ('in_transit', 'delivered')`);
        await pg.query(`
          CREATE TABLE "delivery_assignment" (
            "id" UUID NOT NULL DEFAULT gen_random_uuid(),
            "order_id" UUID NOT NULL,
            "carrier_id" UUID NOT NULL,
            "status" "DeliveryAssignmentStatus" NOT NULL DEFAULT 'in_transit',
            "assigned_at" TIMESTAMP(3) NOT NULL,
            "delivered_at" TIMESTAMP(3),
            "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "delivery_assignment_pkey" PRIMARY KEY ("id")
          )
        `);
      } finally {
        await pg.end();
      }
    });

    afterAll(async () => {
      await factory.disposeClient(legacySchema);
      const pg = new PgClient({ connectionString: process.env.DATABASE_URL ?? '' });
      await pg.connect();
      try {
        await pg.query(`DROP SCHEMA IF EXISTS "${legacySchema}" CASCADE`);
      } finally {
        await pg.end();
      }
    });

    it('cancels an order with NO open assignment without touching the missing enum value', async () => {
      const prisma = factory.getClient(legacySchema);

      await expect(
        prisma.$transaction((tx) => cancelAssignmentOnOrderCancelTx(tx, randomUUID())),
      ).resolves.toBeUndefined();
    });

    it('still cancels when the order HAS a row that simply is not in_transit', async () => {
      const prisma = factory.getClient(legacySchema);
      const orderId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "delivery_assignment" ("order_id","carrier_id","status","assigned_at","updated_at")
         VALUES ($1::uuid, $2::uuid, 'delivered', now(), now())`,
        orderId,
        randomUUID(),
      );

      await expect(
        prisma.$transaction((tx) => cancelAssignmentOnOrderCancelTx(tx, orderId)),
      ).resolves.toBeUndefined();
    });

    /**
     * The boundary, stated rather than hidden: an un-migrated tenant that
     * genuinely holds an OPEN assignment for the order being cancelled STILL
     * fails, because there is no enum value to write. That failure is
     * correct — there is no honest way to close that row on the old schema —
     * and it is now the ONLY case that fails, instead of every cancellation
     * in the tenant. `scripts/tenant-migrate.ts --check` at boot is what makes
     * it a deploy-time error rather than a runtime surprise.
     */
    it('fails loudly — and ONLY — when there is genuinely an open assignment to close', async () => {
      const prisma = factory.getClient(legacySchema);
      const orderId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "delivery_assignment" ("order_id","carrier_id","status","assigned_at","updated_at")
         VALUES ($1::uuid, $2::uuid, 'in_transit', now(), now())`,
        orderId,
        randomUUID(),
      );

      await expect(
        prisma.$transaction((tx) => cancelAssignmentOnOrderCancelTx(tx, orderId)),
      ).rejects.toThrow(/invalid input value for enum/i);
    });
  });
});
