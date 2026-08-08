import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { assertSchemaName } from './schema-name.js';
import { TenantPrismaFactory } from './tenant-prisma-factory.js';
import type { PrismaClient } from '../../generated/tenant/client.js';

export interface TenantContext {
  companyId: string;
  schemaName: string;
}

/**
 * Thrown by `getClient()` when no tenant context is active (spec:
 * salesops-tenancy "Tenant Client Acquisition Fails Loud, Never Falls
 * Back"). There is deliberately NO catch-and-fall-back anywhere near this —
 * a caller that forgot to open a scope must see an error, never a client
 * silently bound to `public` or any other schema.
 */
export class TenantContextNotActiveError extends Error {
  constructor() {
    super(
      'No active tenant context: getClient() must be called inside TenantContextService.run(...)',
    );
    this.name = 'TenantContextNotActiveError';
  }
}

/**
 * AsyncLocalStorage-backed carrier for "which tenant is this call scoped
 * to" (design.md D2/D5). `run()` opens a scope; `getClient()` resolves the
 * bounded per-schema client for whatever scope is active via
 * `TenantPrismaFactory`, and throws instead of falling back when none is.
 *
 * This service does NOT decide when to (re-)open a scope — `run()` is
 * called by `TenantContextGuard` (once, per request, Phase 7) and by
 * `runInTenant` at each handler call site (design.md D5: the guard's ALS
 * scope does not survive into the handler, so every tenant-touching call
 * re-opens its own). Both land in later phases; this class is the shared
 * primitive they build on.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  constructor(private readonly factory: TenantPrismaFactory) {}

  /** Runs `fn` with `context` active for its duration (including across `await`s inside it). */
  run<T>(context: TenantContext, fn: () => T): T {
    assertSchemaName(context.schemaName);
    return this.als.run(context, fn);
  }

  /** The active tenant context, or `undefined` outside any `run()` scope. */
  getContext(): TenantContext | undefined {
    return this.als.getStore();
  }

  /**
   * Resolves the bounded Prisma client for the active tenant context.
   * THROWS `TenantContextNotActiveError` when no scope is active — never
   * falls back to a default/master client (spec: "No tenant context throws
   * instead of silently using master").
   */
  getClient(): PrismaClient {
    const context = this.als.getStore();
    if (!context) {
      throw new TenantContextNotActiveError();
    }
    return this.factory.getClient(context.schemaName);
  }
}
