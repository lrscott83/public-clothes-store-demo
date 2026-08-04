import { Module } from '@nestjs/common';
import { PrismaService } from './prisma-client.js';
import { PrismaMasterService } from './master-prisma-client.js';
import { TenantDefaultPrismaService } from './tenant/tenant-default-prisma.service.js';
import { TenantPrismaFactory } from './tenant/tenant-prisma-factory.js';
import { TenantContextService } from './tenant/tenant-context.service.js';
import { TenantDatabaseService } from './tenant/tenant-database.service.js';

/**
 * `PrismaService` stays registered (still injected by
 * `PrismaCompanyUserRepository`'s remaining old-shape consumers, and by
 * `prisma/seed.js` — task 3.5). `PrismaMasterService` and
 * `TenantDefaultPrismaService` are the master/tenant-labeled clients
 * (task 3.4/3.5) — see `TenantDefaultPrismaService`'s doc comment for why
 * the latter is still a temporary wrapper, not the real per-tenant factory.
 *
 * `TenantPrismaFactory`/`TenantContextService`/`TenantDatabaseService`
 * (task 4.1/4.2, design.md D2/D6/D7) are the real per-tenant acquisition
 * path. They do not yet REPLACE `TenantDefaultPrismaService` as the
 * injected dependency of the ~13 tenant-side repos — that swap is Phase 6.
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
