import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { schemaNameFor } from './schema-name.js';
import {
  LOCK_TRANSACTION_BUDGET,
  TENANT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  TENANT_LOCK_TIMEOUT_MS,
  TENANT_STATEMENT_TIMEOUT_MS,
} from '../lock-budget.js';
import { TenantPrismaFactory } from './tenant-prisma-factory.js';
import type { PrismaClient } from '../../generated/tenant/client.js';

interface CacheEntry {
  client: PrismaClient;
  pool: Pool;
}

/**
 * Bounded, cached per-schema Prisma client pool (design.md D2 — landmine 1
 * fix: poolops passes no `max`, never evicts, and never calls
 * `disposeClient`). No real tenant schema needs to exist for these tests:
 * `Pool`/`PrismaClient` construction with a driver adapter is lazy —
 * nothing opens a socket until a query runs, and none of these tests run
 * one. The disposal assertions DO call through to the real
 * `pg.Pool#end()` / `PrismaClient#$disconnect()` (no mocks, this package's
 * convention) — both resolve cleanly on a pool/client that never connected.
 *
 * `cache` is a private implementation detail; these tests reach into it via
 * `as unknown as {...}` deliberately rather than adding a
 * test-only public accessor to the production class.
 */
describe('TenantPrismaFactory', () => {
  function randomSchemaName(): string {
    return schemaNameFor(randomUUID());
  }

  function cacheOf(factory: TenantPrismaFactory): Map<string, CacheEntry> {
    return (factory as unknown as { cache: Map<string, CacheEntry> }).cache;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getClient() returns the same client instance for the same schema (cache hit)', () => {
    const factory = new TenantPrismaFactory();
    const schemaName = randomSchemaName();

    const first = factory.getClient(schemaName);
    const second = factory.getClient(schemaName);

    expect(second).toBe(first);
  });

  it('getClient() returns distinct client instances for distinct schemas', () => {
    const factory = new TenantPrismaFactory();

    const a = factory.getClient(randomSchemaName());
    const b = factory.getClient(randomSchemaName());

    expect(a).not.toBe(b);
  });

  it('getClient() rejects an invalid schema name before touching any pool', () => {
    const factory = new TenantPrismaFactory();

    expect(() => factory.getClient('not-a-real-tenant-schema')).toThrow();
    expect(cacheOf(factory).size).toBe(0);
  });

  it('builds each pool with the configured max, idle timeout, and a search_path scoped to the schema', () => {
    const factory = new TenantPrismaFactory({ max: 3, idleTimeoutMillis: 12_345 });
    const schemaName = randomSchemaName();

    factory.getClient(schemaName);

    const entry = cacheOf(factory).get(schemaName);
    expect(entry).toBeDefined();
    expect(entry?.pool.options.max).toBe(3);
    expect(entry?.pool.options.idleTimeoutMillis).toBe(12_345);
    // The tenant schema alone — a `,public` fallback would let a missing
    // tenant table resolve out of `public` instead of raising. See
    // `tenant-search-path-isolation.spec.ts` for the behavioural proof.
    expect(entry?.pool.options.options).toContain(`-c search_path="${schemaName}"`);
    expect(entry?.pool.options.options).not.toContain('public');
  });

  /**
   * The SERVER-SIDE ceilings that actually enforce `LOCK_TRANSACTION_BUDGET`.
   * Nothing used to set them, and Prisma's client-side `timeout` is evaluated
   * when a query is DISPATCHED — it cannot cancel an in-flight statement — so
   * a transaction blocked behind an `idle in transaction` holder waited
   * indefinitely while holding a pool connection. That is the exact failure
   * the 20s budget claimed to bound.
   *
   * Asserted on the POOL, not on a call site, because raw SQL riding the
   * driver directly (`lockOrderRowTx`, `applyReservationTx`, the anti-join)
   * never passes through a Prisma transaction option.
   */
  it('carries lock_timeout and statement_timeout, both strictly under the transaction budget', () => {
    const factory = new TenantPrismaFactory();
    const schemaName = randomSchemaName();

    factory.getClient(schemaName);

    const options = cacheOf(factory).get(schemaName)?.pool.options.options;
    expect(options).toContain(`-c lock_timeout=${TENANT_LOCK_TIMEOUT_MS}`);
    expect(options).toContain(`-c statement_timeout=${TENANT_STATEMENT_TIMEOUT_MS}`);
    // `statement_timeout` cannot see a transaction that is open with NOTHING
    // running — the `idle in transaction` holder shape that made these lock
    // waits pathological in the first place.
    expect(options).toContain(
      `-c idle_in_transaction_session_timeout=${TENANT_IDLE_IN_TRANSACTION_TIMEOUT_MS}`,
    );
    // The ORDER of the four numbers is the contract: a lock conflict must be
    // reported as a lock conflict; the SERVER must give up before the client
    // does, since it is the only party that can cancel the work; and the idle
    // reaper must sit ABOVE the transaction budget so it can only ever reap a
    // transaction that is genuinely abandoned.
    expect(TENANT_LOCK_TIMEOUT_MS).toBeLessThan(TENANT_STATEMENT_TIMEOUT_MS);
    expect(TENANT_STATEMENT_TIMEOUT_MS).toBeLessThan(LOCK_TRANSACTION_BUDGET.timeout);
    expect(TENANT_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBeGreaterThan(LOCK_TRANSACTION_BUDGET.timeout);
  });

  it('defaults max/idleTimeoutMillis to explicit values (never pg\'s bare default of 10/no-timeout)', () => {
    const factory = new TenantPrismaFactory();
    const schemaName = randomSchemaName();

    factory.getClient(schemaName);

    const entry = cacheOf(factory).get(schemaName);
    expect(entry?.pool.options.max).toBeGreaterThan(0);
    expect(entry?.pool.options.idleTimeoutMillis).toBeGreaterThan(0);
    // A pool that waits FOREVER for a connection turns saturation into a hang
    // rather than the fast failure `maxWait` documents.
    expect(entry?.pool.options.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  /**
   * `max` is PER TENANT SCHEMA and multiplies by the LRU cap, so the total
   * connections one process can open is `max * lruCap` — which must stay under
   * a Postgres `max_connections` whose default is 100. Widening the pool to
   * "absorb" the longer transaction budget would have made a per-tenant tuning
   * change into a fleet-wide connection exhaustion; the hold time is bounded
   * by the server-side `statement_timeout` instead. Locked here so the next
   * person to reach for `max` sees the constraint they are trading against.
   */
  it('keeps max * lruCap under a default Postgres max_connections', () => {
    const factory = new TenantPrismaFactory();
    const schemaName = randomSchemaName();

    factory.getClient(schemaName);

    const max = cacheOf(factory).get(schemaName)!.pool.options.max!;
    expect(max * 20).toBeLessThanOrEqual(100);
  });

  it('evicts the least-recently-used schema once the cache exceeds its LRU cap, and disposes it', async () => {
    const factory = new TenantPrismaFactory({ lruCap: 2 });
    const disposeSpy = jest.spyOn(factory, 'disposeClient');
    const schemaA = randomSchemaName();
    const schemaB = randomSchemaName();
    const schemaC = randomSchemaName();

    factory.getClient(schemaA);
    factory.getClient(schemaB);
    factory.getClient(schemaC); // pushes the cache to size 3, over the cap of 2

    await Promise.resolve();
    await Promise.resolve();

    expect(disposeSpy).toHaveBeenCalledWith(schemaA);
    const cache = cacheOf(factory);
    expect(cache.has(schemaA)).toBe(false);
    expect(cache.has(schemaB)).toBe(true);
    expect(cache.has(schemaC)).toBe(true);
    expect(cache.size).toBeLessThanOrEqual(2);
  });

  it('touching a cached schema (repeat getClient) moves it to the front of the LRU order', async () => {
    const factory = new TenantPrismaFactory({ lruCap: 2 });
    const disposeSpy = jest.spyOn(factory, 'disposeClient');
    const schemaA = randomSchemaName();
    const schemaB = randomSchemaName();
    const schemaC = randomSchemaName();

    factory.getClient(schemaA);
    factory.getClient(schemaB);
    factory.getClient(schemaA); // touch A again — B is now the least recently used
    factory.getClient(schemaC); // must evict B, not A

    await Promise.resolve();
    await Promise.resolve();

    expect(disposeSpy).toHaveBeenCalledWith(schemaB);
    const cache = cacheOf(factory);
    expect(cache.has(schemaA)).toBe(true);
    expect(cache.has(schemaB)).toBe(false);
  });

  it('disposeClient() removes the schema from the cache and disposes its pool + client', async () => {
    const factory = new TenantPrismaFactory();
    const schemaName = randomSchemaName();
    const client = factory.getClient(schemaName);
    const entry = cacheOf(factory).get(schemaName)!;
    const disconnectSpy = jest.spyOn(client, '$disconnect');
    const poolEndSpy = jest.spyOn(entry.pool, 'end');

    await factory.disposeClient(schemaName);

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(poolEndSpy).toHaveBeenCalledTimes(1);
    expect(cacheOf(factory).has(schemaName)).toBe(false);
  });

  it('disposeClient() on an unknown schema is a no-op', async () => {
    const factory = new TenantPrismaFactory();

    await expect(factory.disposeClient(randomSchemaName())).resolves.toBeUndefined();
  });

  it('onModuleDestroy() disposes every cached client (not just on process exit — landmine 1)', async () => {
    const factory = new TenantPrismaFactory();
    const disposeSpy = jest.spyOn(factory, 'disposeClient');
    const schemaA = randomSchemaName();
    const schemaB = randomSchemaName();
    factory.getClient(schemaA);
    factory.getClient(schemaB);

    await factory.onModuleDestroy();

    expect(disposeSpy).toHaveBeenCalledWith(schemaA);
    expect(disposeSpy).toHaveBeenCalledWith(schemaB);
    expect(cacheOf(factory).size).toBe(0);
  });
});
