import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/master/client.js';

/**
 * `PrismaMasterService` wraps the MASTER-schema generated Prisma client
 * (`prisma/master/schema.prisma`, design.md §1/§3 — identity + the
 * `(userId, companyId)` access decision: `User`, `Company`, `Membership`,
 * `TemplateCategory`, `TemplateProduct`, `ProvisioningIncident`,
 * `RefreshToken`, `PasswordResetToken`). It replaces `PrismaService`
 * (`./prisma-client.js`, the pre-split client) for every repository that is
 * genuinely master-side (SDD change multi-tenant-by-schema, task 3.5).
 *
 * Same lifecycle wiring as `PrismaService` — connect on module init with an
 * eager `SELECT 1` (the driver-adapter + WASM query compiler architecture's
 * `$connect()` alone does not fail fast on an unreachable DB), disconnect on
 * module destroy.
 */
@Injectable()
export class PrismaMasterService
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
