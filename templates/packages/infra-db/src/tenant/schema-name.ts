/**
 * Single choke point for deriving and validating tenant schema names
 * (design D3). Schema names get interpolated into DDL (`CREATE SCHEMA`,
 * `SET search_path`) where Postgres offers no bind-parameter form for
 * identifiers, so every call site that builds or receives one — the
 * provisioner, the tenant client factory, and the migration tool — MUST
 * validate through these two functions before issuing any SQL. Never
 * string-build a schema name any other way (spec salesops-tenancy
 * "Schema-Per-Tenant Topology", scenario "Invalid schema name is rejected
 * everywhere it is used").
 */

const SCHEMA_PREFIX = 'store_mgmt_tenant_';

/** Canonical UUID form: 8-4-4-4-12 hex digits, case-insensitive. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `schemaNameFor`'s output shape: the prefix followed by the lowercased
 * UUID with dashes replaced by underscores (Postgres identifiers do not
 * need quoting for underscores; dashes would force quoted-identifier
 * handling everywhere the name is used).
 */
const SCHEMA_NAME_REGEX = new RegExp(
  `^${SCHEMA_PREFIX}[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$`,
);

/** Thrown by `schemaNameFor` when `companyId` is not a well-formed UUID. */
export class InvalidCompanyIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCompanyIdError';
  }
}

/** Thrown by `assertSchemaName` when a schema name does not match the derived format. */
export class InvalidSchemaNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSchemaNameError';
  }
}

/**
 * Derives the tenant schema name for a `Company.id`. `companyId` MUST be a
 * canonical UUID string; anything else throws `InvalidCompanyIdError`
 * before any string is built, since the result is destined for DDL
 * interpolation.
 */
export function schemaNameFor(companyId: string): string {
  if (typeof companyId !== 'string' || !UUID_REGEX.test(companyId)) {
    throw new InvalidCompanyIdError(
      `companyId must be a canonical UUID, got: ${JSON.stringify(companyId)}`,
    );
  }

  return `${SCHEMA_PREFIX}${companyId.toLowerCase().replaceAll('-', '_')}`;
}

/**
 * Validates that `name` matches exactly the format `schemaNameFor`
 * produces. Called by the tenant client factory, the provisioner, and the
 * migration tool at every site that interpolates a schema name into SQL —
 * throws `InvalidSchemaNameError` instead of letting a malformed name reach
 * `CREATE SCHEMA` / `SET search_path`.
 */
export function assertSchemaName(name: string): void {
  if (typeof name !== 'string' || !SCHEMA_NAME_REGEX.test(name)) {
    throw new InvalidSchemaNameError(
      `Invalid tenant schema name: ${JSON.stringify(name)}`,
    );
  }
}
