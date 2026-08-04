import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/client/client.js';

/**
 * TEMPORARY (SDD change multi-tenant-by-schema, task 3.5 — WU3b). Every
 * repository under `src/{currency,customer,sales,commission,inventory,
 * product,users/warehouse-operator}/` plus `company/prisma-company-user.repository.ts`
 * injects THIS class instead of `PrismaService`, purely to give tenant-side
 * repositories their own DI/import identity ahead of Phase 6 (design.md §3
 * file map) and Phase 14.1's eslint boundary rule ("tenant repos may not
 * import the master `PrismaService`").
 *
 * It does NOT yet wrap `prisma/tenant/schema.prisma`'s generated client
 * (`../../generated/tenant/client.js`). It wraps the SAME pre-split default
 * client `PrismaService` uses (`../../generated/client/client.js`), because
 * task 3.5 found that the real tenant client's shape is not yet compatible
 * with the physical tables it would run against:
 *
 * - `prisma/tenant/schema.prisma`'s `Customer.companyUserId` and
 *   `WarehouseOperator.companyUserId` (design.md D1's reshape) do not exist
 *   as columns on the legacy `customer`/`warehouse_operator` tables still
 *   physically present in `public` — those tables still have `user_id`,
 *   FK'd to `app_user`, and no per-tenant schema has been provisioned to
 *   hold the reshaped columns yet.
 * - `prisma/tenant/schema.prisma`'s collapsed-PK `CompanyUser` (`id`,
 *   `role`, `createdByCompanyUserId` — no `userId`/`companyId`/`status`,
 *   design.md D1) does not match the legacy `company_user` table either,
 *   which still carries all three and is still what
 *   `PrismaCompanyUserRepository`'s existing consumers (`AuthService`,
 *   `UsersService`, `CustomerIdentityService`, `JwtStrategy`) depend on.
 *
 * Fixing either requires the real per-tenant schema + data reshape that
 * Phase 6 (repository re-sourcing) and Phase 10 (provisioning saga) do —
 * out of scope for a "retype the client import" task. Binding this class to
 * the OLD client keeps every existing spec passing unchanged (same
 * physical tables, same columns, same FK graph) while still moving the
 * DEPENDENCY the repo declares.
 *
 * Phase 4 replaces this class's ACQUISITION (`TenantContextService.getClient()`,
 * one bounded client per tenant schema, design.md D2) and Phase 6 replaces
 * its TYPE (the real `generated/tenant` client, once a tenant schema with
 * the reshaped columns actually exists to run it against) — for the ~12
 * repos design.md's file map actually scopes to Phase 6 (task 6.1-6.3:
 * currency, customer, sales/order, commission x3, inventory x3,
 * product/category, warehouse-operator). `PrismaCompanyUserRepository` was
 * named above as a co-injector of this class back when this comment was
 * written (WU3b, before design.md's file map settled), but design.md's file
 * map is explicit that it is one of the **5 master-side repos left
 * unchanged** by Phase 6, not one of the ~12. Task 6.5 (2026-08-04) audited
 * every WU3b-era prediction against the actual Phase 6 diff and confirmed:
 * `PrismaCompanyUserRepository` still binds this class, still implements the
 * pre-reshape `ICompanyUserRepository` (`userId`/`companyId`/`status`), and
 * was NOT touched by 6.1-6.3. It stays a `TenantDefaultPrismaService`
 * consumer — old shape, old client — until Phase 7 (`JwtStrategy`) and
 * Phase 10 (`AuthService`, the saga) stop calling it; only then does 14.3
 * delete it. Until then, this is a named placeholder, not the final design —
 * do not read it as one.
 */
@Injectable()
export class TenantDefaultPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? '',
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
