import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { PrismaMasterService } from '../master-prisma-client.js';
import { schemaNameFor } from './schema-name.js';
import { TenantDatabaseService } from './tenant-database.service.js';
import { sweepTenantOrphans } from './tenant-orphan-sweep.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Integration test against the real `store_mgmt_test` database (no mocks —
 * same discipline as every other `infra-db` spec, task 10.3's own
 * instruction: "a mocked sweep proves nothing about a reconciliation tool").
 * Every fixture below is a REAL master row and/or a REAL Postgres schema,
 * created and torn down per test.
 */
describe('sweepTenantOrphans', () => {
  const connectionString = process.env.DATABASE_URL ?? '';
  let prisma: PrismaMasterService;
  let tenantDb: TenantDatabaseService;
  let rawClient: PgClient;
  const createdSchemas: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaMasterService();
    tenantDb = new TenantDatabaseService();
    rawClient = new PgClient({ connectionString });
    await rawClient.connect();
  });

  afterEach(async () => {
    await prisma.membership.deleteMany({});
    await prisma.provisioningIncident.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.user.deleteMany({});
    while (createdSchemas.length > 0) {
      const schemaName = createdSchemas.pop()!;
      await tenantDb.deleteSchema(schemaName);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rawClient.end();
  });

  async function createUser(): Promise<string> {
    const user = await prisma.user.create({
      data: { login: `sweep.${randomUUID()}`, passwordHash: VALID_HASH, fullName: 'Sweep Spec User' },
    });
    return user.id;
  }

  /** A fully-provisioned, healthy Company: schema exists, Company.schemaName set, matches design D7 step 1-3. */
  async function createProvisionedCompany(): Promise<{ companyId: string; schemaName: string }> {
    const company = await prisma.company.create({
      data: { name: 'Tienda Sweep Spec', slug: `sweep-spec-${randomUUID()}` },
    });
    const schemaName = schemaNameFor(company.id);
    await tenantDb.createSchema(schemaName);
    createdSchemas.push(schemaName);
    await prisma.company.update({ where: { id: company.id }, data: { schemaName } });
    return { companyId: company.id, schemaName };
  }

  async function insertTenantCompanyUser(schemaName: string, userId: string): Promise<void> {
    await rawClient.query(`SET search_path TO "${schemaName}"`);
    try {
      await rawClient.query(
        'INSERT INTO "company_user" (id, role, created_at, updated_at) VALUES ($1, $2, now(), now())',
        [userId, 1],
      );
    } finally {
      // MUST run even if the insert above throws — `rawClient` is one
      // long-lived session shared by every test in this file, and leaving
      // it scoped to a (soon-to-be-dropped) tenant schema would make every
      // subsequent query in the file fail with "relation ... does not
      // exist" against `public`.
      await rawClient.query('SET search_path TO public');
    }
  }

  async function insertMembership(
    userId: string,
    companyId: string,
    createdAt: Date = new Date(),
  ): Promise<string> {
    const { rows } = await rawClient.query<{ id: string }>(
      `INSERT INTO "membership" (id, user_id, company_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', $3, $3) RETURNING id`,
      [userId, companyId, createdAt],
    );
    return rows[0]!.id;
  }

  describe('class 1 — orphan schemas', () => {
    it('reports a real tenant schema with no Company row claiming it, and never touches a claimed one', async () => {
      const { schemaName: claimedSchema } = await createProvisionedCompany();

      const orphanSchemaName = schemaNameFor(randomUUID());
      await tenantDb.createSchema(orphanSchemaName);
      createdSchemas.push(orphanSchemaName);

      const report = await sweepTenantOrphans(connectionString);

      expect(report.orphanSchemas.map((f) => f.schemaName)).toContain(orphanSchemaName);
      expect(report.orphanSchemas.map((f) => f.schemaName)).not.toContain(claimedSchema);
    });

    it('does NOT flag a schema whose owning Company row still exists mid-saga (schemaName not yet set)', async () => {
      const company = await prisma.company.create({
        data: { name: 'Mid Saga Co', slug: `mid-saga-${randomUUID()}` },
      });
      const schemaName = schemaNameFor(company.id);
      await tenantDb.createSchema(schemaName);
      createdSchemas.push(schemaName);
      // Deliberately NOT setting company.schemaName — simulates the window
      // between D7 step 2 (CREATE SCHEMA) and step 3 (schemaName set).

      const report = await sweepTenantOrphans(connectionString);

      expect(report.orphanSchemas.map((f) => f.schemaName)).not.toContain(schemaName);
    });

    it('never lists `public` or a non-tenant-prefixed schema', async () => {
      const report = await sweepTenantOrphans(connectionString);

      expect(report.orphanSchemas.map((f) => f.schemaName)).not.toContain('public');
      for (const finding of report.orphanSchemas) {
        expect(finding.schemaName).toMatch(/^store_mgmt_tenant_/);
      }
    });

    it('--allow-destructive drops an orphan schema and leaves a claimed one alone', async () => {
      const { schemaName: claimedSchema } = await createProvisionedCompany();
      const orphanSchemaName = schemaNameFor(randomUUID());
      await tenantDb.createSchema(orphanSchemaName);
      createdSchemas.push(orphanSchemaName);

      const report = await sweepTenantOrphans(connectionString, { allowDestructive: true });

      expect(report.reconciled.schemasDropped).toContain(orphanSchemaName);
      await expect(tenantDb.schemaExists(orphanSchemaName)).resolves.toBe(false);
      await expect(tenantDb.schemaExists(claimedSchema)).resolves.toBe(true);
      // Already dropped by the sweep — afterEach must not try again.
      createdSchemas.splice(createdSchemas.indexOf(orphanSchemaName), 1);
    });

    it('WITHOUT --allow-destructive, an orphan schema is reported but left standing', async () => {
      const orphanSchemaName = schemaNameFor(randomUUID());
      await tenantDb.createSchema(orphanSchemaName);
      createdSchemas.push(orphanSchemaName);

      const report = await sweepTenantOrphans(connectionString);

      expect(report.orphanSchemas.map((f) => f.schemaName)).toContain(orphanSchemaName);
      expect(report.reconciled.schemasDropped).toEqual([]);
      await expect(tenantDb.schemaExists(orphanSchemaName)).resolves.toBe(true);
    });
  });

  describe('class 2 — dangling Company.schemaName', () => {
    it('reports a Company whose schemaName points at a schema that does not exist', async () => {
      const company = await prisma.company.create({
        data: { name: 'Dangling Co', slug: `dangling-${randomUUID()}` },
      });
      const schemaName = schemaNameFor(company.id);
      await prisma.company.update({ where: { id: company.id }, data: { schemaName } });
      // Deliberately never created via tenantDb.createSchema — the schema genuinely does not exist.

      const report = await sweepTenantOrphans(connectionString);

      expect(report.danglingCompanySchemas).toContainEqual({ companyId: company.id, schemaName });
    });

    it('--allow-destructive clears the dangling schemaName back to NULL', async () => {
      const company = await prisma.company.create({
        data: { name: 'Dangling Co 2', slug: `dangling2-${randomUUID()}` },
      });
      const schemaName = schemaNameFor(company.id);
      await prisma.company.update({ where: { id: company.id }, data: { schemaName } });

      const report = await sweepTenantOrphans(connectionString, { allowDestructive: true });

      expect(report.reconciled.companySchemaNamesCleared).toContain(company.id);
      const reloaded = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
      expect(reloaded.schemaName).toBeNull();
    });

    it('does not flag a Company whose schema genuinely exists', async () => {
      const { companyId } = await createProvisionedCompany();

      const report = await sweepTenantOrphans(connectionString);

      expect(report.danglingCompanySchemas.map((f) => f.companyId)).not.toContain(companyId);
    });
  });

  describe('class 3 — Membership with no tenant CompanyUser', () => {
    it('reports (past the grace window) an ACTIVE Membership with no matching tenant CompanyUser', async () => {
      const { companyId } = await createProvisionedCompany();
      const userId = await createUser();
      const oldEnough = new Date(Date.now() - 60 * 60_000); // 1 hour ago
      const membershipId = await insertMembership(userId, companyId, oldEnough);

      const report = await sweepTenantOrphans(connectionString, { graceMinutes: 15 });

      expect(report.orphanMemberships.map((f) => f.membershipId)).toContain(membershipId);
      expect(report.inFlightMemberships).toEqual([]);
    });

    it('does NOT report a Membership that DOES have a matching tenant CompanyUser', async () => {
      const { companyId, schemaName } = await createProvisionedCompany();
      const userId = await createUser();
      await insertTenantCompanyUser(schemaName, userId);
      const oldEnough = new Date(Date.now() - 60 * 60_000);
      await insertMembership(userId, companyId, oldEnough);

      const report = await sweepTenantOrphans(connectionString, { graceMinutes: 15 });

      expect(report.orphanMemberships).toEqual([]);
      expect(report.inFlightMemberships).toEqual([]);
    });

    it('a FRESH Membership with no tenant CompanyUser is reported as in-flight, never as an orphan — the race window', async () => {
      const { companyId } = await createProvisionedCompany();
      const userId = await createUser();
      const membershipId = await insertMembership(userId, companyId, new Date());

      const report = await sweepTenantOrphans(connectionString, { graceMinutes: 15 });

      expect(report.orphanMemberships.map((f) => f.membershipId)).not.toContain(membershipId);
      expect(report.inFlightMemberships.map((f) => f.membershipId)).toContain(membershipId);
    });

    it('--allow-destructive deletes a confirmed orphan Membership, never an in-flight one', async () => {
      const { companyId } = await createProvisionedCompany();
      const orphanUserId = await createUser();
      const inFlightUserId = await createUser();
      const orphanMembershipId = await insertMembership(
        orphanUserId,
        companyId,
        new Date(Date.now() - 60 * 60_000),
      );
      const inFlightMembershipId = await insertMembership(inFlightUserId, companyId, new Date());

      const report = await sweepTenantOrphans(connectionString, { allowDestructive: true, graceMinutes: 15 });

      expect(report.reconciled.membershipsDeleted).toContain(orphanMembershipId);
      expect(report.reconciled.membershipsDeleted).not.toContain(inFlightMembershipId);
      const remaining = await prisma.membership.findMany({ where: { companyId } });
      expect(remaining.map((m) => m.id)).toEqual([inFlightMembershipId]);
    });

    it('a REVOKED Membership with no tenant CompanyUser is never flagged — only ACTIVE ones are a broken grant', async () => {
      const { companyId } = await createProvisionedCompany();
      const userId = await createUser();
      await rawClient.query(
        `INSERT INTO "membership" (id, user_id, company_id, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'REVOKED', $3, $3)`,
        [userId, companyId, new Date(Date.now() - 60 * 60_000)],
      );

      const report = await sweepTenantOrphans(connectionString, { graceMinutes: 15 });

      expect(report.orphanMemberships).toEqual([]);
      expect(report.inFlightMemberships).toEqual([]);
    });
  });

  describe('unresolved ProvisioningIncident cross-reference', () => {
    it('reports unresolved incidents, informationally, without gating any other finding', async () => {
      const company = await prisma.company.create({
        data: { name: 'Incident Co', slug: `incident-${randomUUID()}` },
      });
      await prisma.provisioningIncident.create({
        data: { companyId: company.id, step: 'tenant-company-user-rollback', reason: 'DROP failed' },
      });

      const report = await sweepTenantOrphans(connectionString);

      expect(report.unresolvedIncidents.map((i) => i.companyId)).toContain(company.id);
    });

    it('does not report an already-resolved incident', async () => {
      const company = await prisma.company.create({
        data: { name: 'Resolved Co', slug: `resolved-${randomUUID()}` },
      });
      await prisma.provisioningIncident.create({
        data: { companyId: company.id, step: 'x', reason: 'y', resolvedAt: new Date() },
      });

      const report = await sweepTenantOrphans(connectionString);

      expect(report.unresolvedIncidents.map((i) => i.companyId)).not.toContain(company.id);
    });
  });
});
