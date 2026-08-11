import { DuplicateCompanySlugError } from '@store-mgmt/domain';
import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaCompanyRepository } from './prisma-company.repository.js';

/**
 * Integration tests against the real `store_mgmt_test` Postgres database (no
 * mocks) — same discipline as `prisma-customer.repository.spec.ts`.
 * `create`/`setSchemaName`/`delete` are the provisioning saga's writes
 * (design.md D7, `create-company.saga.ts`) — the ONLY writer of a `Company`
 * row in production; `list`/`findById` stay pure reads.
 *
 * task 14.2: no legacy `company_user` cleanup anymore — `Membership` is the
 * ONLY thing that still relates to `Company` on the master schema
 * (`onDelete: Cascade`, `prisma/master/schema.prisma`), and the tenant
 * `CompanyUser` D1 reshaped this table into lives in a separate Postgres
 * schema Prisma cannot even express a `@relation` to. A plain
 * `company.deleteMany({})` needs no manual ordering.
 */
describe('PrismaCompanyRepository', () => {
  let prisma: PrismaMasterService;
  let repository: PrismaCompanyRepository;

  beforeAll(() => {
    prisma = new PrismaMasterService();
    repository = new PrismaCompanyRepository(prisma);
  });

  // Wipe before AND after: a fresh master schema seeds nothing (task 14.2's
  // reset dropped the legacy migration that used to seed a `default`-slug
  // Company), but this still guards the "no Company exists"/"exactly one"
  // assertions below against leftovers from a sibling suite.
  beforeEach(async () => {
    await prisma.company.deleteMany({});
  });

  afterEach(async () => {
    await prisma.company.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('list() returns every persisted Company with schemaName null', async () => {
    await prisma.company.create({ data: { name: 'Tienda Prueba', slug: 'default' } });

    const companies = await repository.list();

    expect(companies).toHaveLength(1);
    expect(companies[0]?.name).toBe('Tienda Prueba');
    expect(companies[0]?.schemaName).toBeNull();
    expect(companies[0]?.isActive).toBe(true);
  });

  it('list() returns an empty array when no Company exists', async () => {
    const companies = await repository.list();
    expect(companies).toEqual([]);
  });

  it('findById() round-trips a persisted Company', async () => {
    const created = await prisma.company.create({ data: { name: 'Tienda Prueba', slug: 'default' } });

    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.slug).toBe('default');
  });

  it('findById() returns null for an unknown id', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('findBySlug() resolves an existing company, including isActive and schemaName', async () => {
    const created = await prisma.company.create({ data: { name: 'Acme', slug: 'acme' } });
    await prisma.company.update({ where: { id: created.id }, data: { schemaName: 'store_mgmt_tenant_acme' } });

    const found = await repository.findBySlug('acme');

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.slug).toBe('acme');
    expect(found?.isActive).toBe(true);
    expect(found?.schemaName).toBe('store_mgmt_tenant_acme');
  });

  it('findBySlug() returns null for an unknown slug', async () => {
    const found = await repository.findBySlug('doesnotexist');
    expect(found).toBeNull();
  });

  it('create() persists a new Company with schemaName NULL — provisioning saga step 1', async () => {
    const created = await repository.create({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

    expect(created.id).toEqual(expect.any(String));
    expect(created.name).toBe('Tienda Nueva');
    expect(created.slug).toBe('tienda-nueva');
    expect(created.schemaName).toBeNull();
    expect(created.isActive).toBe(true);
  });

  it('setSchemaName() sets a non-null schemaName — provisioning saga step 3', async () => {
    const created = await repository.create({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

    const updated = await repository.setSchemaName(created.id, 'store_mgmt_tenant_deadbeef');

    expect(updated.schemaName).toBe('store_mgmt_tenant_deadbeef');
  });

  it('setSchemaName() clears schemaName back to NULL — step 3 compensation', async () => {
    const created = await repository.create({ name: 'Tienda Nueva', slug: 'tienda-nueva' });
    await repository.setSchemaName(created.id, 'store_mgmt_tenant_deadbeef');

    const rolledBack = await repository.setSchemaName(created.id, null);

    expect(rolledBack.schemaName).toBeNull();
  });

  it('create() maps a duplicate slug (P2002) to DuplicateCompanySlugError, no application-level pre-check', async () => {
    await repository.create({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

    await expect(repository.create({ name: 'Otra Tienda', slug: 'tienda-nueva' })).rejects.toBeInstanceOf(
      DuplicateCompanySlugError,
    );
  });

  it('delete() removes a Company row — step 1 compensation', async () => {
    const created = await repository.create({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

    await repository.delete(created.id);

    expect(await repository.findById(created.id)).toBeNull();
  });
});
