import type { ICompanyRepository, IMembershipRepository } from '@store-mgmt/domain';
import { createCompany, createCompanyUser, USER_ROLES } from '@store-mgmt/domain';
import { schemaNameFor } from '../tenant/schema-name.js';
import type { TenantDatabaseService } from '../tenant/tenant-database.service.js';
import type { PrismaMasterService } from '../master-prisma-client.js';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/client.js';
import { copyCatalog, type CopyCatalogResult } from '../product/copy-catalog.js';

export interface ProvisionCompanyInput {
  readonly name: string;
  readonly slug: string;
  /** Master `User.id` of the company's first member — becomes the tenant `CompanyUser` with the `owner` role. */
  readonly ownerId: string;
}

export interface ProvisionCompanyResult {
  readonly companyId: string;
  readonly schemaName: string;
  readonly ownerCompanyUserId: string;
  readonly categoriesCopied: number;
  readonly productsCopied: number;
  /** `true` when an already-provisioned Company with this `slug` was found and reused — every step below was skipped. */
  readonly reused: boolean;
}

/**
 * Script-facing mirror of `create-company.saga.ts` (design.md D7), used by
 * `prisma/seed.js` (task 14.2) to provision the demo tenant OUTSIDE
 * NestJS's DI container. A seed script cannot import `apps/api-idp` — apps
 * depend on packages, never the reverse (architecture.md) — so this
 * reproduces the SAME six steps with the SAME infra-db primitives the saga
 * itself is built from (`ICompanyRepository`/`IMembershipRepository`,
 * `TenantDatabaseService`, `copyCatalog`), not a parallel implementation.
 *
 * Two deliberate differences from the saga, both because this runs as
 * throwaway dev tooling, never in a request path:
 *  - NO compensation on failure. A seed script that fails partway is meant
 *    to be fixed and re-run against a clean `prisma migrate reset`, not
 *    rolled back automatically.
 *  - IDEMPOTENT across repeated `pnpm seed` runs without a reset first: if
 *    `slug` already resolves to a fully-provisioned Company (non-null
 *    `schemaName`, owner CompanyUser already present), every step is
 *    skipped and the existing tenant's info is returned (`reused: true`).
 */
export async function provisionCompany(
  masterPrisma: PrismaMasterService,
  companyRepository: ICompanyRepository,
  membershipRepository: IMembershipRepository,
  tenantDatabaseService: TenantDatabaseService,
  getTenantClient: (schemaName: string) => TenantPrismaClient,
  input: ProvisionCompanyInput,
): Promise<ProvisionCompanyResult> {
  const existing = await masterPrisma.company.findUnique({ where: { slug: input.slug } });

  if (existing?.schemaName) {
    const tenantClient = getTenantClient(existing.schemaName);
    const ownerCompanyUser = await tenantClient.companyUser.findUnique({ where: { id: input.ownerId } });
    if (ownerCompanyUser) {
      return {
        companyId: existing.id,
        schemaName: existing.schemaName,
        ownerCompanyUserId: ownerCompanyUser.id,
        categoriesCopied: 0,
        productsCopied: 0,
        reused: true,
      };
    }
  }

  // Invariant check only, discarded — mirrors the saga.
  createCompany({ name: input.name, slug: input.slug });

  // Step 1 — master Company, schemaName NULL (or reuse a partially-provisioned row).
  const company = existing ?? (await companyRepository.create({ name: input.name, slug: input.slug }));

  // Step 2 — CREATE SCHEMA + tenant DDL (D6: search_path is set first, inside TenantDatabaseService).
  const schemaName = schemaNameFor(company.id);
  if (!(await tenantDatabaseService.schemaExists(schemaName))) {
    await tenantDatabaseService.createSchema(schemaName);
  }

  // Step 3 — Company.schemaName = <name>.
  const updated =
    company.schemaName === schemaName ? company : await companyRepository.setSchemaName(company.id, schemaName);

  // Step 4 — master Membership, ACTIVE (idempotent — reuses an existing row).
  const membership =
    (await membershipRepository.findByUserAndCompany(input.ownerId, updated.id)) ??
    (await membershipRepository.create({ userId: input.ownerId, companyId: updated.id, status: 'ACTIVE' }));
  void membership;

  const tenantClient = getTenantClient(schemaName);

  // Step 5 — the owner's tenant CompanyUser (idempotent — reuses an existing row).
  let ownerCompanyUser = await tenantClient.companyUser.findUnique({ where: { id: input.ownerId } });
  if (!ownerCompanyUser) {
    // Invariant check only, discarded — mirrors CustomerIdentityService, the saga.
    createCompanyUser({ id: input.ownerId, role: USER_ROLES.owner, createdByCompanyUserId: null });
    ownerCompanyUser = await tenantClient.companyUser.create({
      data: { id: input.ownerId, role: USER_ROLES.owner, createdByCompanyUserId: null },
    });
  }

  // Step 6 — copy the master catalog templates into the tenant, AWAITED (P9).
  const catalog: CopyCatalogResult = await copyCatalog(masterPrisma, tenantClient);

  return {
    companyId: updated.id,
    schemaName,
    ownerCompanyUserId: ownerCompanyUser.id,
    categoriesCopied: catalog.categoriesCopied,
    productsCopied: catalog.productsCopied,
    reused: false,
  };
}
