import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaProvisioningIncidentRepository } from './prisma-provisioning-incident.repository.js';

/**
 * Integration tests against the real `store_mgmt_test` Postgres database (no
 * mocks). `ProvisioningIncident.companyId` has NO FK (design D7 — a
 * compensation failure can outlive the `Company` row it is about), so
 * fixtures use an arbitrary UUID rather than a real `Company` row.
 */
describe('PrismaProvisioningIncidentRepository', () => {
  let prisma: PrismaMasterService;
  let repository: PrismaProvisioningIncidentRepository;

  beforeAll(() => {
    prisma = new PrismaMasterService();
    repository = new PrismaProvisioningIncidentRepository(prisma);
  });

  afterEach(async () => {
    await prisma.provisioningIncident.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create() persists a ProvisioningIncident with resolvedAt null by default', async () => {
    const incident = await repository.create({
      companyId: '11111111-1111-1111-1111-111111111111',
      step: 'create-schema-rollback',
      reason: 'DROP SCHEMA timed out',
    });

    expect(incident.id).toEqual(expect.any(String));
    expect(incident.companyId).toBe('11111111-1111-1111-1111-111111111111');
    expect(incident.step).toBe('create-schema-rollback');
    expect(incident.reason).toBe('DROP SCHEMA timed out');
    expect(incident.resolvedAt).toBeNull();
  });

  it('listUnresolved() returns only incidents with resolvedAt null', async () => {
    await repository.create({
      companyId: '22222222-2222-2222-2222-222222222222',
      step: 'membership-rollback',
      reason: 'FK violation',
    });
    const resolved = await repository.create({
      companyId: '33333333-3333-3333-3333-333333333333',
      step: 'schema-user-rollback',
      reason: 'permission denied',
    });
    await prisma.provisioningIncident.update({
      where: { id: resolved.id },
      data: { resolvedAt: new Date() },
    });

    const unresolved = await repository.listUnresolved();

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.step).toBe('membership-rollback');
  });

  it('listUnresolved() returns an empty array when no incident is unresolved', async () => {
    const unresolved = await repository.listUnresolved();
    expect(unresolved).toEqual([]);
  });
});
