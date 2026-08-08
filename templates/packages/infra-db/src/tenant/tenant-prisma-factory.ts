import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { assertSchemaName } from './schema-name.js';
import {
  LOCK_TRANSACTION_BUDGET,
  TENANT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  TENANT_LOCK_TIMEOUT_MS,
  TENANT_STATEMENT_TIMEOUT_MS,
} from '../lock-budget.js';
import { PrismaClient } from '../../generated/tenant/client.js';

export interface TenantPrismaFactoryOptions {
  /** `pg.Pool` `max` per tenant schema. Env: `TENANT_POOL_MAX`. */
  max?: number;
  /** `pg.Pool` `idleTimeoutMillis` per tenant schema. Env: `TENANT_POOL_IDLE_TIMEOUT_MS`. */
  idleTimeoutMillis?: number;
  /** `pg.Pool` `connectionTimeoutMillis` per tenant schema. Env: `TENANT_POOL_CONNECTION_TIMEOUT_MS`. */
  connectionTimeoutMillis?: number;
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
//
// `max` RECONCILED WITH THE TRANSACTION BUDGET, and the reconciliation is why
// it did NOT change. `LOCK_TRANSACTION_BUDGET` raised Prisma's client-side
// `timeout` from 5s to 20s, which reads like a 4x longer connection hold on
// the same 5-connection pool. It is not, because that client-side number
// never bounded the hold in the first place: it is evaluated when a query is
// DISPATCHED, so a transaction blocked on a row lock — or simply left idle in
// one — held its connection INDEFINITELY (see `lock-budget.ts`). The real
// worst-case hold before this round was UNBOUNDED. It is now bounded by the
// three server-side ceilings below: each statement at 18s, each lock wait at
// 15s, and an abandoned open transaction reaped at 30s. Bounded is strictly
// better than unbounded, so the pool does not need widening to absorb it.
//
// Note what is NOT claimed: none of these caps the total hold of a long
// MULTI-statement transaction, which can legitimately run several statements
// inside the 20s budget. `timeout` is what bounds that, across dispatches.
//
// Widening it would also have been actively harmful. `max` is PER TENANT
// SCHEMA and multiplies by `DEFAULT_LRU_CAP` cached schemas: at `max: 20` one
// process can open 400 connections against a server whose default
// `max_connections` is 100. Raising the per-tenant number to fix a per-tenant
// hold time is how a pool-tuning change becomes a fleet-wide outage.
const DEFAULT_MAX = 5;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_LRU_CAP = 20;
// A request that cannot get a connection within Prisma's own `maxWait` is
// already lost; without this, `pg` waits forever for one and the caller sees a
// hang rather than the fast saturation failure `maxWait` is documented to give.
const DEFAULT_CONNECTION_TIMEOUT_MS = LOCK_TRANSACTION_BUDGET.maxWait;

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
  private readonly connectionTimeoutMillis: number;
  private readonly lruCap: number;
  // `Map` preserves insertion order; re-inserting a key on touch moves it to
  // the end, so the FIRST key iterated is always the least recently used —
  // this IS the LRU order, no separate bookkeeping needed.
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * `@Optional()` is load-bearing, not decorative — discovered while
   * wiring Phase 12's e2e suite (SDD change multi-tenant-by-schema, task
   * 12.2). `TenantPrismaFactoryOptions` is a plain interface: it erases at
   * runtime, so `emitDecoratorMetadata` (`tsconfig.backend.json`) reports
   * this parameter's design-time type as bare `Object`. Without
   * `@Optional()`, Nest's real DI container (bootstrapping the FULL
   * `AppModule` — the exact path every e2e spec exercises, and the one
   * unit specs never did, since they always mocked or hand-constructed
   * this class) tries to resolve a provider for the `Object` token, finds
   * none, and throws "can't resolve dependencies" before the constructor's
   * own `= {}` default ever gets a chance to apply. `@Optional()` tells
   * Nest to inject `undefined` instead of throwing, which is exactly what
   * lets the default parameter value take over — the intended behavior
   * all along (this class always reads its real tuning from `envInt(...)`
   * when no `options` are passed programmatically).
   */
  constructor(@Optional() options: TenantPrismaFactoryOptions = {}) {
    this.max = options.max ?? envInt('TENANT_POOL_MAX', DEFAULT_MAX);
    this.idleTimeoutMillis =
      options.idleTimeoutMillis ?? envInt('TENANT_POOL_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS);
    this.connectionTimeoutMillis =
      options.connectionTimeoutMillis ??
      envInt('TENANT_POOL_CONNECTION_TIMEOUT_MS', DEFAULT_CONNECTION_TIMEOUT_MS);
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
      connectionTimeoutMillis: this.connectionTimeoutMillis,
      // Three connect options, and only the first is about isolation.
      //
      // `search_path`: the tenant schema ALONE — no `,public` fallback.
      // Postgres resolves an unqualified name against each schema in order, so
      // a trailing `public` would turn a missing tenant table into a silent
      // read of whatever `public` holds (legacy business tables today, the
      // master tables after 14.2's reset). A missing table must raise, not
      // resolve somewhere else. Proven by
      // `tenant-search-path-isolation.spec.ts`.
      //
      // `lock_timeout`/`statement_timeout`/`idle_in_transaction_session_timeout`:
      // the SERVER-SIDE ceilings that actually enforce
      // `LOCK_TRANSACTION_BUDGET`. Nothing used to set any of them, and
      // Prisma's client-side `timeout` is evaluated when a query is
      // DISPATCHED — it cannot cancel an in-flight statement — so a
      // transaction blocked behind an `idle in transaction` holder waited
      // INDEFINITELY while holding one of these connections. That is the exact
      // failure the 20s budget claimed to bound.
      //
      // All three are needed and they bound different things: the first two
      // bound a STATEMENT (a lock wait, and execution generally), the third
      // bounds a transaction that is open with NO statement running — which is
      // the holder shape that made the lock waits pathological to begin with,
      // and the one `statement_timeout` cannot see.
      //
      // They go on the POOL, not on individual calls, so they cover raw SQL
      // riding the driver directly (`lockOrderRowTx`, `applyReservationTx`,
      // the anti-join) as well as statements issued through a Prisma model
      // call. See `lock-budget.ts` for what each layer really guarantees.
      options:
        `-c search_path="${schemaName}"` +
        ` -c lock_timeout=${TENANT_LOCK_TIMEOUT_MS}` +
        ` -c statement_timeout=${TENANT_STATEMENT_TIMEOUT_MS}` +
        ` -c idle_in_transaction_session_timeout=${TENANT_IDLE_IN_TRANSACTION_TIMEOUT_MS}`,
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
