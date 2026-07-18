import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';

/**
 * PrismaService wraps the generated Prisma client with the `pg` driver
 * adapter and wires it into Nest's lifecycle: connect on module init,
 * disconnect on module destroy. Inject this wherever DB access is needed —
 * consumers never import `@prisma/client` directly.
 */
@Injectable()
export class PrismaService
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
    // `$connect()` alone does not eagerly validate connectivity with the
    // driver-adapter + WASM query compiler architecture — it can resolve
    // even when the database is unreachable. Run a cheap query so that an
    // unreachable DB fails the Nest bootstrap instead of silently booting.
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
