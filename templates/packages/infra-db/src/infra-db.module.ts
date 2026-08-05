import { Module } from '@nestjs/common';
import { PrismaService } from './prisma-client.js';
import { PrismaMasterService } from './master-prisma-client.js';
import { TenantDefaultPrismaService } from './tenant/tenant-default-prisma.service.js';
import { TenantPrismaFactory } from './tenant/tenant-prisma-factory.js';
import { TenantContextService } from './tenant/tenant-context.service.js';
import { TenantDatabaseService } from './tenant/tenant-database.service.js';

/**
 * `PrismaService` stays registered (still injected by `prisma/seed.js` —
 * task 3.5). `PrismaMasterService` and `TenantDefaultPrismaService` are the
 * master/tenant-labeled clients (task 3.4/3.5) — see
 * `TenantDefaultPrismaService`'s doc comment for why the latter is now a
 * legacy-cleanup-only helper, not a production DI consumer.
 *
 * `TenantPrismaFactory`/`TenantContextService`/`TenantDatabaseService`
 * (task 4.1/4.2, design.md D2/D6/D7) are the real per-tenant acquisition
 * path. Phase 6 (6.1-6.3) swapped them in for the ~12 repos design.md's
 * file map actually scopes to it (currency, customer, sales/order,
 * commission x3, inventory x3, product/category, warehouse-operator).
 * `PrismaCompanyUserRepository`, the last consumer still binding
 * `TenantDefaultPrismaService` in production wiring, was deleted in task
 * 14.3 once Phases 7/8/10 retired its own callers (task 6.5's retirement
 * inventory, tasks.md Phase 6).
 */
@Module({
  providers: [
    PrismaService,
    PrismaMasterService,
    TenantDefaultPrismaService,
    TenantPrismaFactory,
    TenantContextService,
    TenantDatabaseService,
  ],
  exports: [
    PrismaService,
    PrismaMasterService,
    TenantDefaultPrismaService,
    TenantPrismaFactory,
    TenantContextService,
    TenantDatabaseService,
  ],
})
export class InfraDbModule {}
