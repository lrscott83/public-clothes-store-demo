import { Module } from '@nestjs/common';
import { PrismaService } from './prisma-client.js';
import { PrismaMasterService } from './master-prisma-client.js';
import { TenantDefaultPrismaService } from './tenant/tenant-default-prisma.service.js';

/**
 * `PrismaService` stays registered (still injected by
 * `PrismaCompanyUserRepository`'s remaining old-shape consumers, and by
 * `prisma/seed.js` — task 3.5). `PrismaMasterService` and
 * `TenantDefaultPrismaService` are the new master/tenant-labeled clients
 * (task 3.4/3.5) — see `TenantDefaultPrismaService`'s doc comment for why
 * the latter is still a temporary wrapper, not the real per-tenant factory
 * (that is Phase 4/6).
 */
@Module({
  providers: [PrismaService, PrismaMasterService, TenantDefaultPrismaService],
  exports: [PrismaService, PrismaMasterService, TenantDefaultPrismaService],
})
export class InfraDbModule {}
