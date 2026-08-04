import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { schemaNameFor } from './schema-name.js';
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
    expect(entry?.pool.options.options).toBe(`-c search_path="${schemaName}"`);
  });

  it('defaults max/idleTimeoutMillis to explicit values (never pg\'s bare default of 10/no-timeout)', () => {
    const factory = new TenantPrismaFactory();
    const schemaName = randomSchemaName();

    factory.getClient(schemaName);

    const entry = cacheOf(factory).get(schemaName);
    expect(entry?.pool.options.max).toBeGreaterThan(0);
    expect(entry?.pool.options.idleTimeoutMillis).toBeGreaterThan(0);
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
