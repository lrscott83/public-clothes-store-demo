import { randomUUID } from 'node:crypto';
import { schemaNameFor } from './schema-name.js';
import { TenantContextNotActiveError, TenantContextService } from './tenant-context.service.js';
import type { TenantPrismaFactory } from './tenant-prisma-factory.js';

/**
 * Unit tests for the AsyncLocalStorage-backed tenant context (design.md D2/D5).
 * `TenantPrismaFactory` is faked here — this file's job is to prove context
 * propagation and the fail-loud contract, not pool/connection behavior
 * (covered by tenant-prisma-factory.spec.ts). Real Postgres integration
 * coverage of the acquisition path lives where the client is actually used.
 */
describe('TenantContextService', () => {
  function fakeFactory(): { getClient: jest.Mock } {
    return { getClient: jest.fn().mockReturnValue({ marker: 'fake-tenant-client' }) };
  }

  function service(factory: { getClient: jest.Mock }): TenantContextService {
    return new TenantContextService(factory as unknown as TenantPrismaFactory);
  }

  it('getClient() throws TenantContextNotActiveError when no tenant context is active', () => {
    const factory = fakeFactory();
    const svc = service(factory);

    expect(() => svc.getClient()).toThrow(TenantContextNotActiveError);
  });

  it('never falls back to any default client when no context is active (spec: Tenant Client Acquisition Fails Loud, Never Falls Back)', () => {
    const factory = fakeFactory();
    const svc = service(factory);

    let thrown: unknown;
    try {
      svc.getClient();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(TenantContextNotActiveError);
    // The proof that matters: the factory — the only path to any real
    // client — was never even asked for one. No query can have reached any
    // schema.
    expect(factory.getClient).not.toHaveBeenCalled();
  });

  it('getClient() inside run() resolves the client for the active schema from the factory', () => {
    const factory = fakeFactory();
    const svc = service(factory);
    const companyId = randomUUID();
    const schemaName = schemaNameFor(companyId);

    const client = svc.run({ companyId, schemaName }, () => svc.getClient());

    expect(factory.getClient).toHaveBeenCalledWith(schemaName);
    expect(client).toBe(factory.getClient.mock.results[0]?.value);
  });

  it('run() rejects an invalid schemaName before entering the scope, and never touches the factory', () => {
    const factory = fakeFactory();
    const svc = service(factory);

    expect(() =>
      svc.run(
        { companyId: randomUUID(), schemaName: 'not-a-real-schema' },
        () => svc.getClient(),
      ),
    ).toThrow();
    expect(factory.getClient).not.toHaveBeenCalled();
  });

  it('the tenant context does not leak outside run()', () => {
    const factory = fakeFactory();
    const svc = service(factory);
    const companyId = randomUUID();
    const schemaName = schemaNameFor(companyId);

    svc.run({ companyId, schemaName }, () => svc.getClient());

    expect(() => svc.getClient()).toThrow(TenantContextNotActiveError);
  });

  it('the context survives an await inside run() — real AsyncLocalStorage propagation, not just synchronous scoping', async () => {
    const factory = fakeFactory();
    const svc = service(factory);
    const companyId = randomUUID();
    const schemaName = schemaNameFor(companyId);

    const client = await svc.run({ companyId, schemaName }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return svc.getClient();
    });

    expect(factory.getClient).toHaveBeenCalledWith(schemaName);
    expect(client).toBeDefined();
  });

  it('two concurrent run() scopes do not see each other\'s tenant (isolation, not just a single active slot)', async () => {
    const factory = fakeFactory();
    const svc = service(factory);
    const companyIdA = randomUUID();
    const schemaNameA = schemaNameFor(companyIdA);
    const companyIdB = randomUUID();
    const schemaNameB = schemaNameFor(companyIdB);

    const [seenA, seenB] = await Promise.all([
      svc.run({ companyId: companyIdA, schemaName: schemaNameA }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return svc.getContext();
      }),
      svc.run({ companyId: companyIdB, schemaName: schemaNameB }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return svc.getContext();
      }),
    ]);

    expect(seenA).toEqual({ companyId: companyIdA, schemaName: schemaNameA });
    expect(seenB).toEqual({ companyId: companyIdB, schemaName: schemaNameB });
  });

  it('getContext() returns the active tenant context, or undefined outside a scope', () => {
    const factory = fakeFactory();
    const svc = service(factory);
    const companyId = randomUUID();
    const schemaName = schemaNameFor(companyId);

    expect(svc.getContext()).toBeUndefined();

    const seen = svc.run({ companyId, schemaName }, () => svc.getContext());

    expect(seen).toEqual({ companyId, schemaName });
  });
});
