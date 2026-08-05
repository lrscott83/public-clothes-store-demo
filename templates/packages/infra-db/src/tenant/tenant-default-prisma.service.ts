import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/client/client.js';

/**
 * LEGACY (SDD change multi-tenant-by-schema, task 3.5 — WU3b, historical).
 * Originally injected by every tenant-side repository ahead of Phase 6
 * (design.md §3 file map) purely to give them their own DI/import identity
 * distinct from `PrismaService`, and by the now-deleted
 * `PrismaCompanyUserRepository` (`company/prisma-company-user.repository.ts`,
 * removed in task 14.3 once Phases 7/8/10 moved its last old-shape
 * consumers — `JwtStrategy`, `CustomerIdentityService`, `AuthService`,
 * `UsersService` — onto the reshaped tenant `CompanyUser` and master
 * `Membership`, design D1).
 *
 * Phase 6 (6.1-6.3) moved all ~12 tenant repos off this class onto the real
 * per-tenant client (`TenantContextService.getClient()`, design D2), so this
 * class no longer has any production DI consumer. It still wraps the SAME
 * pre-split default client `PrismaService` uses
 * (`../../generated/client/client.js`) and stays alive ONLY as a
 * hand-constructed (`new TenantDefaultPrismaService()`) hygiene helper in a
 * handful of specs that still need to clear rows from the legacy,
 * unmigrated `public` tables (`prisma-company.repository.spec.ts`,
 * `prisma-user.repository.spec.ts`, `prisma-refresh-token.repository.spec.ts`,
 * `prisma-password-reset-token.repository.spec.ts`) — not a placeholder for
 * further migration work.
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
