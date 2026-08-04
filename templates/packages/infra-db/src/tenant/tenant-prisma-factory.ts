import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { assertSchemaName } from './schema-name.js';
import { PrismaClient } from '../../generated/tenant/client.js';

export interface TenantPrismaFactoryOptions {
  /** `pg.Pool` `max` per tenant schema. Env: `TENANT_POOL_MAX`. */
  max?: number;
  /** `pg.Pool` `idleTimeoutMillis` per tenant schema. Env: `TENANT_POOL_IDLE_TIMEOUT_MS`. */
  idleTimeoutMillis?: number;
  /** Max distinct tenant schemas cached at once before LRU eviction. Env: `TENANT_POOL_LRU_CAP`. */
  lruCap?: number;
}

interface CacheEntry {
  client: PrismaClient;
  pool: Pool;
}

// `5`/`30_000`/`20` are starting values, not measured ones (design.md §7 Open
// Items carries the same caveat for `max`) — tune via env once there is
// fleet data to tune against.
const DEFAULT_MAX = 5;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_LRU_CAP = 20;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Bounded, cached, disposable per-schema Prisma client pool (design.md D2).
 * `Map<schemaName, {client, pool}>` — one `pg.Pool` + `PrismaPg` adapter per
 * tenant schema, with the tenant baked into the connection via BOTH
 * `PrismaPg`'s `schema` option and the pool's `-c search_path=...` connect
 * option (belt and suspenders — `-c search_path` also governs raw SQL that
 * rides the driver directly, per design.md §4).
 *
 * Fixes poolops's landmine 1: no bare `max` (pg's own default is 10, opaque
 * and unbounded in practice), no unbounded cache growth (LRU cap evicts),
 * and `disposeClient` has real call sites — from LRU eviction AND from
 * `onModuleDestroy`, not only from process exit.
 *
 * This class does NOT decide which schema to use — see `TenantContextService`
 * for the fail-loud acquisition path (`getClient()` here is keyed by an
 * explicit, already-validated schema name; callers reach it only through
 * the context service in production code).
 */
@Injectable()
export class TenantPrismaFactory implements OnModuleDestroy {
  private readonly max: number;
  private readonly idleTimeoutMillis: number;
  private readonly lruCap: number;
  // `Map` preserves insertion order; re-inserting a key on touch moves it to
  // the end, so the FIRST key iterated is always the least recently used —
  // this IS the LRU order, no separate bookkeeping needed.
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: TenantPrismaFactoryOptions = {}) {
    this.max = options.max ?? envInt('TENANT_POOL_MAX', DEFAULT_MAX);
    this.idleTimeoutMillis =
      options.idleTimeoutMillis ?? envInt('TENANT_POOL_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS);
    this.lruCap = options.lruCap ?? envInt('TENANT_POOL_LRU_CAP', DEFAULT_LRU_CAP);
  }

  getClient(schemaName: string): PrismaClient {
    assertSchemaName(schemaName);

    const existing = this.cache.get(schemaName);
    if (existing) {
      this.touch(schemaName, existing);
      return existing.client;
    }

    const entry = this.createEntry(schemaName);
    this.cache.set(schemaName, entry);
    this.evictIfOverCap();
    return entry.client;
  }

  /** Disposes and removes one schema's client/pool. Safe to call on a schema not in the cache. */
  async disposeClient(schemaName: string): Promise<void> {
    const entry = this.cache.get(schemaName);
    if (!entry) return;
    this.cache.delete(schemaName);
    await entry.client.$disconnect();
    // `PrismaPg` defaults `disposeExternalPool` to `false` for a
    // caller-provided `pg.Pool` — `$disconnect()` alone does NOT close it.
    // We own this pool exclusively, so we must end it ourselves.
    await entry.pool.end();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.cache.keys()].map((schemaName) => this.disposeClient(schemaName)));
  }

  private touch(schemaName: string, entry: CacheEntry): void {
    this.cache.delete(schemaName);
    this.cache.set(schemaName, entry);
  }

  private createEntry(schemaName: string): CacheEntry {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? '',
      max: this.max,
      idleTimeoutMillis: this.idleTimeoutMillis,
      options: `-c search_path="${schemaName}",public`,
    });
    const adapter = new PrismaPg(pool, { schema: schemaName });
    const client = new PrismaClient({ adapter });
    return { client, pool };
  }

  private evictIfOverCap(): void {
    while (this.cache.size > this.lruCap) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      // Fire-and-forget: eviction runs synchronously up to and including
      // removing the entry from `cache` (the disposal work itself is async
      // I/O). Errors here have no caller left to receive them — log, don't
      // throw out of a cache-maintenance path.
      void this.disposeClient(oldestKey).catch((err: unknown) => {
        console.error(
          `TenantPrismaFactory: failed to dispose evicted client for schema ${oldestKey}:`,
          err,
        );
      });
    }
  }
}
