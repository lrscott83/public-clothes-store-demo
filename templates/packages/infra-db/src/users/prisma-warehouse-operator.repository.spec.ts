import { randomUUID } from 'node:crypto';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { fakeTenantContext, useTenantSchema, assertAbsentFromPublicSchema } from '../tenant-schema.spec-helper.js';
import { PrismaWarehouseRepository } from '../inventory/prisma-warehouse.repository.js';
import { PrismaWarehouseOperatorRepository } from './prisma-warehouse-operator.repository.js';

/**
 * Integration tests against a REAL, per-suite provisioned tenant Postgres
 * schema (design.md §4, P12 Option C) — same discipline as
 * `prisma-currency.repository.spec.ts`. `WarehouseOperator` now FKs the
 * tenant `CompanyUser` via `companyUserId` (design.md D1, spec
 * salesops-inventory "WarehouseOperator FKs Tenant CompanyUser, Not Master
 * User") — no more cross-schema `User` FK to satisfy, so
 * `createTestCompanyUser` mints a tenant `CompanyUser` row directly, same
 * pattern as `prisma-customer.repository.spec.ts`.
 */
describe('PrismaWarehouseOperatorRepository', () => {
  const getTenantSchema = useTenantSchema();
  let tenantContext: TenantContextService;
  let repository: PrismaWarehouseOperatorRepository;
  let warehouseRepository: PrismaWarehouseRepository;
  let warehouseId: string;

  beforeAll(() => {
    tenantContext = fakeTenantContext(getTenantSchema);
    repository = new PrismaWarehouseOperatorRepository(tenantContext);
    warehouseRepository = new PrismaWarehouseRepository(tenantContext);
  });

  beforeEach(async () => {
    const warehouse = await warehouseRepository.create({ name: 'Depósito Operadores Spec' });
    warehouseId = warehouse.id;
  });

  afterEach(async () => {
    const prisma = tenantContext.getClient();
    await prisma.warehouseOperator.deleteMany({});
    await prisma.companyUser.deleteMany({});
    await prisma.warehouse.deleteMany({});
  });

  async function createTestCompanyUser(): Promise<string> {
    const companyUser = await tenantContext.getClient().companyUser.create({
      data: { id: randomUUID(), role: 0 },
    });
    return companyUser.id;
  }

  it('create() persists a WarehouseOperator row keyed by companyUserId, scoped to the tenant schema alone', async () => {
    const companyUserId = await createTestCompanyUser();

    const created = await repository.create({ companyUserId, warehouseId });

    expect(created.companyUserId).toBe(companyUserId);
    expect(created.warehouseId).toBe(warehouseId);
    // The trap this batch's instructions call out by name: a spec that never
    // provisions a tenant schema, or that reaches a master/default client,
    // can still pass for the wrong reason. `public` still holds a same-named
    // legacy `warehouse_operator` table until task 14.2's reset — its PK is
    // still the PRE-reshape `user_id` column (D1 hasn't touched `public`),
    // so the check queries that column name, not the tenant schema's
    // `company_user_id`.
    await assertAbsentFromPublicSchema('warehouse_operator', 'user_id', created.companyUserId);
  });

  it('findByUserId() round-trips a persisted WarehouseOperator', async () => {
    const companyUserId = await createTestCompanyUser();
    await repository.create({ companyUserId, warehouseId });

    const found = await repository.findByUserId(companyUserId);

    expect(found).not.toBeNull();
    expect(found?.warehouseId).toBe(warehouseId);
  });

  it('findByUserId() returns null when the user has no WarehouseOperator row', async () => {
    const found = await repository.findByUserId('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('findByWarehouseId() returns every operator scoped to a warehouse — NOT unique', async () => {
    const companyUserIdA = await createTestCompanyUser();
    const companyUserIdB = await createTestCompanyUser();
    await repository.create({ companyUserId: companyUserIdA, warehouseId });
    await repository.create({ companyUserId: companyUserIdB, warehouseId });

    const operators = await repository.findByWarehouseId(warehouseId);

    expect(operators.map((o) => o.companyUserId).sort()).toEqual([companyUserIdA, companyUserIdB].sort());
  });
});
