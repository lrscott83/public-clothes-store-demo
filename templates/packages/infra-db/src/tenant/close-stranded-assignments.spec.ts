import { randomUUID } from 'node:crypto';
import { schemaNameFor } from './schema-name.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { TenantPrismaFactory } from './tenant-prisma-factory.js';
import { sweepStrandedAssignments } from './close-stranded-assignments.js';
import type { PrismaClient } from '../../generated/tenant/client.js';

/**
 * CLASS F3 — the stranded `in_transit`-behind-`cancelled` rows that motivated
 * the whole change already exist in live tenants, and nothing closes them.
 * Real tenant schemas, real rows, no mocks.
 */
describe('sweepStrandedAssignments', () => {
  const connectionString = process.env.DATABASE_URL ?? '';
  const tenantDb = new TenantDatabaseService();
  const factory = new TenantPrismaFactory();
  let schemaName: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    schemaName = schemaNameFor(randomUUID());
    await tenantDb.createSchema(schemaName);
    prisma = factory.getClient(schemaName);
  });

  afterAll(async () => {
    await factory.disposeClient(schemaName);
    await tenantDb.deleteSchema(schemaName);
  });

  afterEach(async () => {
    await prisma.deliveryAssignment.deleteMany({});
    await prisma.carrier.deleteMany({});
    await prisma.orderLine.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.companyUser.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  async function seedAssignment(orderStatus: 'cancelled' | 'verified' | 'delivered', assignmentStatus: 'in_transit' | 'delivered' | 'cancelled') {
    const companyUser = await prisma.companyUser.create({ data: { id: randomUUID(), role: 32 } });
    const customer = await prisma.customer.create({
      data: { fullName: `Cliente ${randomUUID()}`, companyUserId: companyUser.id },
    });
    const warehouse = await prisma.warehouse.create({ data: { name: `Almacén ${randomUUID()}` } });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        customerName: 'Cliente Sweep',
        warehouseId: warehouse.id,
        deliveryMode: 'delivery',
        currency: 'MN',
        status: orderStatus,
        subtotal: '100.00',
        discountTotal: '0.00',
        total: '100.00',
        orderDate: new Date(),
        attributedCompanyUserId: companyUser.id,
      },
    });
    const carrier = await prisma.carrier.create({ data: { name: `Transportes ${randomUUID()}` } });
    const assignment = await prisma.deliveryAssignment.create({
      data: {
        orderId: order.id,
        carrierId: carrier.id,
        status: assignmentStatus,
        assignedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    return { assignmentId: assignment.id, orderId: order.id, carrierId: carrier.id };
  }

  it('reports a stranded row and changes NOTHING by default', async () => {
    const { assignmentId, orderId, carrierId } = await seedAssignment('cancelled', 'in_transit');

    const report = await sweepStrandedAssignments(connectionString, { tenantSchemas: [schemaName] });

    expect(report.failed).toBe(false);
    expect(report.results[0]!.findings).toEqual([
      expect.objectContaining({ schemaName, assignmentId, orderId, carrierId }),
    ]);
    expect(report.results[0]!.closed).toEqual([]);
    const untouched = await prisma.deliveryAssignment.findUnique({ where: { id: assignmentId } });
    expect(untouched?.status).toBe('in_transit');
  });

  it('closes the stranded row as cancelled with --allow-destructive, leaving deliveredAt null', async () => {
    const { assignmentId } = await seedAssignment('cancelled', 'in_transit');

    const report = await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaName],
      allowDestructive: true,
    });

    expect(report.results[0]!.closed).toEqual([assignmentId]);
    const closed = await prisma.deliveryAssignment.findUnique({ where: { id: assignmentId } });
    expect(closed?.status).toBe('cancelled');
    // A cancellation is not a delivery — the same rule
    // `cancelAssignmentOnOrderCancelTx` follows, so throughput stays honest.
    expect(closed?.deliveredAt).toBeNull();
  });

  it('never touches an in_transit assignment whose order is still open', async () => {
    const { assignmentId } = await seedAssignment('verified', 'in_transit');

    const report = await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaName],
      allowDestructive: true,
    });

    expect(report.results[0]!.findings).toEqual([]);
    expect((await prisma.deliveryAssignment.findUnique({ where: { id: assignmentId } }))?.status).toBe(
      'in_transit',
    );
  });

  it('never touches an already-closed assignment behind a cancelled order', async () => {
    const { assignmentId } = await seedAssignment('cancelled', 'delivered');

    const report = await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaName],
      allowDestructive: true,
    });

    expect(report.results[0]!.closed).toEqual([]);
    expect((await prisma.deliveryAssignment.findUnique({ where: { id: assignmentId } }))?.status).toBe(
      'delivered',
    );
  });

  it('is idempotent — a second run finds nothing left to do', async () => {
    await seedAssignment('cancelled', 'in_transit');
    await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaName],
      allowDestructive: true,
    });

    const second = await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaName],
      allowDestructive: true,
    });

    expect(second.results[0]!.findings).toEqual([]);
    expect(second.results[0]!.closed).toEqual([]);
  });

  it('reports a tenant it cannot process without taking the run down', async () => {
    const report = await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaNameFor(randomUUID())],
    });

    expect(report.failed).toBe(true);
    expect(report.results[0]!.error).toBeDefined();
  });

  /**
   * `TenantStrandedAssignmentResult.error` documents "the others still are"
   * [processed]. That contract held only for failures raised INSIDE
   * `sweepOneTenant`'s try block. `assertSchemaName` and `client.connect()`
   * sat OUTSIDE it, so the two most likely real-world failures — a malformed
   * schema name from auto-discovery, and an unreachable database — threw
   * straight out of the per-tenant helper and aborted the whole fleet run,
   * discarding every result already collected. The connection failure also
   * leaked the `pg.Client`.
   */
  describe('one tenant failing never aborts the fleet', () => {
    it('reports an unusable schema name and still processes the tenants after it', async () => {
      const { assignmentId } = await seedAssignment('cancelled', 'in_transit');

      const report = await sweepStrandedAssignments(connectionString, {
        tenantSchemas: ['not-a-valid-schema-name"; DROP TABLE carrier; --', schemaName],
        allowDestructive: true,
      });

      expect(report.failed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results[0]!.error).toBeDefined();
      // THE point: the tenant AFTER the bad one was still swept.
      expect(report.results[1]!.closed).toEqual([assignmentId]);
    });

    it('reports a connection failure per tenant instead of throwing out of the run', async () => {
      const report = await sweepStrandedAssignments('postgresql://nobody@127.0.0.1:1/none', {
        tenantSchemas: [schemaNameFor(randomUUID()), schemaNameFor(randomUUID())],
      });

      expect(report.failed).toBe(true);
      expect(report.results).toHaveLength(2);
      expect(report.results.every((r) => r.error !== undefined)).toBe(true);
    });
  });

  /**
   * `findings` used to be snapshotted from the SELECT, while `closed` came
   * from the UPDATE's own `RETURNING` — and the UPDATE re-states the
   * predicate rather than trusting those ids. The two sets can therefore
   * differ, and the CLI prints `findings` as "what this tool is about to
   * change": a row that became stranded between the two statements was
   * closed and never reported.
   *
   * DRIVEN, not asserted about. The previous version of this test created ONE
   * row before the sweep and never created a second one after the survey, so
   * the closed set and the surveyed set were trivially identical — it passed
   * against the OLD implementation too, which is the definition of a test
   * that cannot fail for the reason it names.
   *
   * A `BEFORE UPDATE` trigger on `delivery_assignment` inserts the second
   * stranded row the FIRST time the closing UPDATE fires — i.e. strictly
   * after the SELECT and strictly inside the write. The same technique
   * `prisma-order.repository.spec.ts` uses to inject a mid-transaction event.
   */
  it('reports every row it actually closed, even one that appeared after the survey', async () => {
    const first = await seedAssignment('cancelled', 'in_transit');
    // Pre-built, so the trigger only has to flip a status — a trigger function
    // cannot easily mint a whole order graph.
    const latecomer = await seedAssignment('verified', 'in_transit');

    // Self-disarming: once the latecomer's order is `cancelled` the guard is
    // false, so the trigger fires exactly once no matter how many batches run.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION strand_a_latecomer() RETURNS trigger AS $fn$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "sales_order"
          WHERE "id" = '${latecomer.orderId}' AND "status"::text = 'verified'
        ) THEN
          UPDATE "sales_order" SET "status" = 'cancelled' WHERE "id" = '${latecomer.orderId}';
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER strand_a_latecomer_trg
      BEFORE UPDATE ON "delivery_assignment"
      FOR EACH ROW EXECUTE FUNCTION strand_a_latecomer();
    `);

    let report;
    try {
      report = await sweepStrandedAssignments(connectionString, {
        tenantSchemas: [schemaName],
        allowDestructive: true,
        // One row per batch, so the second batch runs AFTER the trigger has
        // stranded the latecomer — the row that was never in the survey.
        batchSize: 1,
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS strand_a_latecomer_trg ON "delivery_assignment"',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS strand_a_latecomer()');
    }

    const result = report.results[0]!;
    // BOTH rows were closed — the surveyed one and the one that only became
    // stranded during the write.
    expect(result.closed).toHaveLength(2);
    expect(result.closed).toEqual(
      expect.arrayContaining([first.assignmentId, latecomer.assignmentId]),
    );
    // And every closed id appears in the findings the CLI prints. Snapshot
    // `findings` from the SELECT alone and the latecomer is closed silently.
    expect(result.findings.map((f) => f.assignmentId)).toEqual(
      expect.arrayContaining(result.closed),
    );
  });

  /**
   * The `catch` returned `findings: []` unconditionally, so a tenant that
   * surveyed successfully and then failed during the write reported an error
   * and NO list — when the list is the entire point of the report.
   */
  it('keeps the rows it had already found when the write fails partway', async () => {
    const { assignmentId } = await seedAssignment('cancelled', 'in_transit');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_the_close() RETURNS trigger AS $fn$
      BEGIN
        RAISE EXCEPTION 'close failure injected by close-stranded-assignments.spec';
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_the_close_trg
      BEFORE UPDATE ON "delivery_assignment"
      FOR EACH ROW EXECUTE FUNCTION fail_the_close();
    `);

    let report;
    try {
      report = await sweepStrandedAssignments(connectionString, {
        tenantSchemas: [schemaName],
        allowDestructive: true,
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS fail_the_close_trg ON "delivery_assignment"',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_the_close()');
    }

    const result = report.results[0]!;
    expect(result.error).toBeDefined();
    expect(result.closed).toEqual([]);
    // THE point: the survey's finding survives the write's failure.
    expect(result.findings.map((f) => f.assignmentId)).toEqual([assignmentId]);
  });

  /**
   * The closing UPDATE had no `LIMIT` and no batching, so it took exclusive
   * row locks on EVERY stranded row in the tenant at once and held them until
   * COMMIT — blocking concurrent cancels and delivers on all of them.
   */
  it('closes in batches rather than locking every stranded row at once', async () => {
    await seedAssignment('cancelled', 'in_transit');
    await seedAssignment('cancelled', 'in_transit');
    await seedAssignment('cancelled', 'in_transit');

    const report = await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaName],
      allowDestructive: true,
      batchSize: 2,
    });

    // Batching must not change the OUTCOME — the loop runs until nothing
    // matches, so every stranded row is still closed.
    expect(report.results[0]!.closed).toHaveLength(3);
    expect(
      await prisma.deliveryAssignment.count({ where: { status: 'in_transit' } }),
    ).toBe(0);
  });

  /** The survey's `ORDER BY assigned_at` must survive into what the CLI prints. */
  it('reports findings oldest-first, as the survey ordered them', async () => {
    const older = await seedAssignment('cancelled', 'in_transit');
    const newer = await seedAssignment('cancelled', 'in_transit');
    await prisma.deliveryAssignment.update({
      where: { id: newer.assignmentId },
      data: { assignedAt: new Date('2026-06-01T00:00:00Z') },
    });

    const report = await sweepStrandedAssignments(connectionString, {
      tenantSchemas: [schemaName],
      allowDestructive: true,
    });

    expect(report.results[0]!.findings.map((f) => f.assignmentId)).toEqual([
      older.assignmentId,
      newer.assignmentId,
    ]);
  });
});
