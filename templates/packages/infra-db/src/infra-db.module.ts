import { Module } from '@nestjs/common';
import { PrismaMasterService } from './master-prisma-client.js';
import { TenantPrismaFactory } from './tenant/tenant-prisma-factory.js';
import { TenantContextService } from './tenant/tenant-context.service.js';
import { TenantDatabaseService } from './tenant/tenant-database.service.js';

/**
 * `PrismaMasterService` is the master-schema client (task 3.4/3.5).
 * `TenantPrismaFactory`/`TenantContextService`/`TenantDatabaseService`
 * (task 4.1/4.2, design.md D2/D6/D7) are the real per-tenant acquisition
 * path. Phase 6 (6.1-6.3) swapped them in for the ~12 tenant repos
 * design.md's file map scopes to it (currency, customer, sales/order,
 * commission x3, inventory x3, product/category, warehouse-operator).
 *
 * `PrismaService`/`TenantDefaultPrismaService` (the pre-split monolith
 * client and its legacy-cleanup-only sibling) were deleted in task 14.2:
 * `prisma/schema.prisma`'s legacy schema+migrations, the last thing either
 * class was for, were replaced by `prisma/master/schema.prisma` as the
 * package's default (`prisma.config.ts`), so nothing in `public` matches
 * their generated client's shape anymore after `prisma migrate reset`.
 */
@Module({
  providers: [PrismaMasterService, TenantPrismaFactory, TenantContextService, TenantDatabaseService],
  exports: [PrismaMasterService, TenantPrismaFactory, TenantContextService, TenantDatabaseService],
})
export class InfraDbModule {}
