import { randomUUID } from 'node:crypto';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema, assertAbsentFromPublicSchema } from '../tenant-schema.spec-helper.js';
import { PrismaCustomerRepository } from './prisma-customer.repository.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`. `Customer` now FKs the tenant
 * `CompanyUser` via `companyUserId` (design.md D1, spec salesops-customers
 * "Customer FKs Tenant CompanyUser, Not Master User") — there is no more
 * cross-schema `User` FK to satisfy, so `createTestCompanyUser` mints a
 * tenant `CompanyUser` row directly (its `id` stands in for "the master
 * User.id it represents"; nothing here needs a real master `User` row to
 * exist, because the FK the DB enforces is tenant-local).
 */
describe('PrismaCustomerRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let repository: PrismaCustomerRepository;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    repository = new PrismaCustomerRepository(tenantContext);
  });

  afterEach(async () => {
    const prisma = tenantContext.getClient();
    await prisma.customer.deleteMany({});
    await prisma.companyUser.deleteMany({});
  });

  async function createTestCompanyUser(): Promise<string> {
    const companyUser = await tenantContext.getClient().companyUser.create({
      data: { id: randomUUID(), role: 0 },
    });
    return companyUser.id;
  }

  it('create() persists a Customer with a real DB-generated UUID id and null contacts', async () => {
    const companyUserId = await createTestCompanyUser();
    const created = await repository.create({ fullName: 'Ana Torres', companyUserId });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(created.fullName).toBe('Ana Torres');
    expect(created.companyUserId).toBe(companyUserId);
    expect(created.documentId).toBeNull();
    expect(created.cellPhone).toBeNull();
    expect(created.email).toBeNull();
    expect(created.address).toBeNull();
    expect(created.note).toBeNull();
    expect(created.active).toBe(true);
    // The trap this batch's instructions call out by name: a spec that never
    // provisions a tenant schema, or that reaches a master/default client,
    // can still pass for the wrong reason. `public` still holds a same-named
    // legacy `customer` table until task 14.2's reset.
    await assertAbsentFromPublicSchema('customer', 'id', created.id);
  });

  it('findById() round-trips a persisted Customer', async () => {
    const companyUserId = await createTestCompanyUser();
    const created = await repository.create({
      fullName: 'Luis Pérez',
      companyUserId,
      email: 'luis@example.com',
    });

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.fullName).toBe('Luis Pérez');
    expect(found?.email).toBe('luis@example.com');
    expect(found?.companyUserId).toBe(companyUserId);
  });

  it('findById() returns null for an unknown id', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('update() persists a partial patch', async () => {
    const companyUserId = await createTestCompanyUser();
    const created = await repository.create({ fullName: 'Marta Gómez', companyUserId });

    const updated = await repository.update(created.id, { cellPhone: '555-1234' });

    expect(updated.cellPhone).toBe('555-1234');
    expect(updated.fullName).toBe('Marta Gómez');
  });

  it('softDelete() flips active=false, row still findById-able', async () => {
    const companyUserId = await createTestCompanyUser();
    const created = await repository.create({ fullName: 'José Díaz', companyUserId });

    await repository.softDelete(created.id);

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.active).toBe(false);
  });

  it('list() excludes inactive customers by default, includes them with includeInactive', async () => {
    const activeCompanyUserId = await createTestCompanyUser();
    const inactiveCompanyUserId = await createTestCompanyUser();
    const active = await repository.create({ fullName: 'Yanet Cruz', companyUserId: activeCompanyUserId });
    const inactive = await repository.create({
      fullName: 'Temporal',
      companyUserId: inactiveCompanyUserId,
    });
    await repository.softDelete(inactive.id);

    const defaultList = await repository.list();
    expect(defaultList.map((c) => c.id)).toContain(active.id);
    expect(defaultList.map((c) => c.id)).not.toContain(inactive.id);

    const fullList = await repository.list({ includeInactive: true });
    expect(fullList.map((c) => c.id)).toContain(inactive.id);
  });

  it('allows many customers with a null documentId to coexist', async () => {
    const companyUserIdA = await createTestCompanyUser();
    const companyUserIdB = await createTestCompanyUser();
    const a = await repository.create({ fullName: 'Null Doc A', companyUserId: companyUserIdA });
    const b = await repository.create({ fullName: 'Null Doc B', companyUserId: companyUserIdB });

    expect(a.documentId).toBeNull();
    expect(b.documentId).toBeNull();
  });

  it('rejects a duplicate non-null documentId on create with DuplicateCustomerDocumentError', async () => {
    const { DuplicateCustomerDocumentError } = await import('@store-mgmt/domain');
    const companyUserIdA = await createTestCompanyUser();
    const companyUserIdB = await createTestCompanyUser();
    await repository.create({ fullName: 'Doc Owner', companyUserId: companyUserIdA, documentId: 'D1' });

    await expect(
      repository.create({ fullName: 'Doc Impostor', companyUserId: companyUserIdB, documentId: 'D1' }),
    ).rejects.toThrow(DuplicateCustomerDocumentError);
  });

  it('rejects updating a customer to an existing documentId with DuplicateCustomerDocumentError', async () => {
    const { DuplicateCustomerDocumentError } = await import('@store-mgmt/domain');
    const companyUserIdA = await createTestCompanyUser();
    const companyUserIdB = await createTestCompanyUser();
    await repository.create({ fullName: 'Doc Owner 2', companyUserId: companyUserIdA, documentId: 'D2' });
    const b = await repository.create({ fullName: 'No Doc', companyUserId: companyUserIdB });

    await expect(repository.update(b.id, { documentId: 'D2' })).rejects.toThrow(
      DuplicateCustomerDocumentError,
    );
  });

  it('allows a customer to keep its own documentId on update (no self-collision)', async () => {
    const companyUserId = await createTestCompanyUser();
    const created = await repository.create({ fullName: 'Self Keeper', companyUserId, documentId: 'D3' });

    const updated = await repository.update(created.id, {
      documentId: 'D3',
      cellPhone: '555-9999',
    });

    expect(updated.documentId).toBe('D3');
    expect(updated.cellPhone).toBe('555-9999');
  });

  it('rejects creating a customer whose companyUserId does not reference an existing CompanyUser, with CustomerUserNotFoundError', async () => {
    const { CustomerUserNotFoundError } = await import('@store-mgmt/domain');

    await expect(
      repository.create({
        fullName: 'Ghost User',
        companyUserId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(CustomerUserNotFoundError);
  });

  it('rejects a second Customer with the same companyUserId, with DuplicateCustomerUserError (1:1)', async () => {
    const { DuplicateCustomerUserError } = await import('@store-mgmt/domain');
    const companyUserId = await createTestCompanyUser();
    await repository.create({ fullName: 'First Owner', companyUserId });

    await expect(repository.create({ fullName: 'Second Owner', companyUserId })).rejects.toThrow(
      DuplicateCustomerUserError,
    );
  });
});
