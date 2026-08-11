import { PrismaMasterService } from '../master-prisma-client.js';
import { PrismaCompanyRepository } from './prisma-company.repository.js';

/**
 * Phase 0, spike 0.2 — design.md D2's foundational claim: "the guard needs
 * no scope of its own", because `PrismaCompanyRepository` binds
 * `PrismaMasterService` directly and is schema-independent. This file
 * proves that empirically, against the REAL `store_mgmt_test` Postgres
 * database (no mocks) — same discipline as
 * `prisma-company.repository.spec.ts` — by calling `findById` with NO
 * `TenantContextService.run(...)` wrapper anywhere in this file. If this
 * spec fails or throws `TenantContextNotActiveError`, D2 is WRONG: the
 * public guard would need to open its own tenant scope, and `api-public`'s
 * whole shape (design.md §1/§2) needs rework before Phase 4 is built on it.
 *
 * Note what this file deliberately does NOT import:
 * `TenantContextService`, `tenantContext.run(...)`, any AsyncLocalStorage
 * primitive. Their absence IS the proof.
 */
describe('PrismaMasterService schema-independence (spike 0.2)', () => {
  let prisma: PrismaMasterService;
  let repository: PrismaCompanyRepository;

  beforeAll(() => {
    prisma = new PrismaMasterService();
    repository = new PrismaCompanyRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.company.deleteMany({});
  });

  afterEach(async () => {
    await prisma.company.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('findById() resolves a persisted Company with NO tenantContext.run(...) wrapper', async () => {
    const created = await prisma.company.create({
      data: { name: 'Tienda Prueba', slug: 'default' },
    });

    // No AsyncLocalStorage scope opened anywhere above this line.
    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.slug).toBe('default');
  });

  it('findById() returns null (never throws TenantContextNotActiveError) for an unknown id, unscoped', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');

    expect(found).toBeNull();
  });
});
