import { randomUUID } from 'node:crypto';
import { InvalidCompanyError } from './errors.js';

/**
 * Company (tenant) master-data entity — one row per provisioned tenant
 * (design.md D7, the provisioning saga). `schemaName` names the tenant's own
 * Postgres schema (`schemaNameFor`/`assertSchemaName`,
 * `packages/infra-db/src/tenant/schema-name.ts`) and is now READ and
 * AUTHORITATIVE (design D1/D4) — every tenant-resolution path (e.g.
 * `TenantContextGuard`) treats a NULL `schemaName` identically to an
 * inactive Company: the saga's step 1 creates this row with `schemaName`
 * NULL, and step 3 is the only place that ever sets it.
 */
/**
 * Store kind (spec: salesops-companies "Company Type Metadata Field").
 * DATA ONLY — must never alter provisioning, tenant resolution, guard
 * behavior, or any authorization path. Only `'catalog'` exists today,
 * mirroring the master `"CompanyType"` Postgres enum.
 */
export type CompanyType = 'catalog';

export interface Company {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly isActive: boolean;
  /** Tenant Postgres schema name. NULL until the provisioning saga's step 3 sets it (design.md D7). */
  readonly schemaName: string | null;
  /**
   * Store kind. NULL on rows created before the field existed; defaults to
   * `'catalog'` for inserts that omit it (DB column default).
   */
  readonly type: CompanyType | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input to `createCompany`. `schemaName` is deliberately absent — every
 * `Company` starts with none; the provisioning saga (design.md D7 step 3) is
 * the only writer of a non-null value.
 */
export interface CreateCompanyInput {
  readonly name: string;
  readonly slug: string;
}

/**
 * Validates and constructs a `Company`. Enforces non-empty, non-whitespace
 * `name`/`slug`. Invariant check ONLY (mirrors `createUser`/`createMembership`)
 * — the built entity is discarded by the provisioning saga; the
 * repository/DB remains the single source of truth for `id`/timestamps
 * (`Company.id @default(uuid())`). Throws `InvalidCompanyError` — never
 * silently accepts invalid input.
 */
export function createCompany(input: CreateCompanyInput, type: CompanyType | null = 'catalog'): Company {
  if (!input.name || input.name.trim().length === 0) {
    throw new InvalidCompanyError('Company name must not be empty or whitespace-only');
  }
  if (!input.slug || input.slug.trim().length === 0) {
    throw new InvalidCompanyError('Company slug must not be empty or whitespace-only');
  }

  const now = new Date();
  return {
    id: randomUUID(),
    name: input.name,
    slug: input.slug,
    isActive: true,
    schemaName: null,
    type,
    createdAt: now,
    updatedAt: now,
  };
}
