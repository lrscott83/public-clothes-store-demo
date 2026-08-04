import { randomUUID } from 'node:crypto';
import {
  InvalidCompanyIdError,
  InvalidSchemaNameError,
  schemaNameFor,
  assertSchemaName,
} from './schema-name.js';

/**
 * `schemaNameFor`/`assertSchemaName` are the single choke point that keeps a
 * `Company.id` from becoming a SQL-injectable identifier — schema names get
 * interpolated into DDL (`CREATE SCHEMA`, `SET search_path`) where bind
 * parameters do not work. Rejection of malformed input is the primary
 * behaviour under test here (design D3, spec salesops-tenancy
 * "Schema-Per-Tenant Topology").
 */
describe('schemaNameFor', () => {
  it('derives a schema name from a valid UUID companyId', () => {
    const companyId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    expect(schemaNameFor(companyId)).toBe(
      'store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66afa6',
    );
  });

  it('is stable/deterministic for the same companyId', () => {
    const companyId = randomUUID();

    expect(schemaNameFor(companyId)).toBe(schemaNameFor(companyId));
  });

  it('lowercases an uppercase UUID before deriving the schema name', () => {
    const companyId = '3FA85F64-5717-4562-B3FC-2C963F66AFA6';

    expect(schemaNameFor(companyId)).toBe(
      'store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66afa6',
    );
  });

  it.each([
    ['empty string', ''],
    ['not a UUID at all', 'not-a-uuid'],
    ['UUID missing a segment', '3fa85f64-5717-4562-b3fc'],
    ['UUID with an extra segment', '3fa85f64-5717-4562-b3fc-2c963f66afa6-extra'],
    ['UUID with a non-hex character', '3fa85f64-5717-4562-b3fc-2c963f66afaZ'],
    ['UUID missing its dashes', '3fa85f6457174562b3fc2c963f66afa6'],
    [
      'SQL injection attempt via semicolon',
      "3fa85f64-5717-4562-b3fc-2c963f66afa6; DROP TABLE users;--",
    ],
    ['double-quote metacharacter', '3fa85f64-5717-4562-b3fc-2c963f66afa6"'],
    ["single-quote metacharacter", "3fa85f64-5717-4562-b3fc-2c963f66afa6'"],
    ['whitespace-padded UUID', ' 3fa85f64-5717-4562-b3fc-2c963f66afa6 '],
    ['newline-injected UUID', '3fa85f64-5717-4562-b3fc-2c963f66afa6\n'],
  ])('rejects %s', (_label, companyId) => {
    expect(() => schemaNameFor(companyId)).toThrow(InvalidCompanyIdError);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error - deliberately passing a non-string at the boundary
    expect(() => schemaNameFor(undefined)).toThrow(InvalidCompanyIdError);
    // @ts-expect-error - deliberately passing a non-string at the boundary
    expect(() => schemaNameFor(null)).toThrow(InvalidCompanyIdError);
  });
});

describe('assertSchemaName', () => {
  it('accepts a schema name produced by schemaNameFor', () => {
    const name = schemaNameFor('3fa85f64-5717-4562-b3fc-2c963f66afa6');

    expect(() => assertSchemaName(name)).not.toThrow();
  });

  it.each([
    ['empty string', ''],
    ['missing the tenant prefix', '3fa85f64_5717_4562_b3fc_2c963f66afa6'],
    ['wrong prefix', 'public_store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66afa6'],
    [
      'uppercase hex in the UUID part',
      'store_mgmt_tenant_3FA85F64_5717_4562_B3FC_2C963F66AFA6',
    ],
    [
      'dashes instead of underscores',
      'store_mgmt_tenant_3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ],
    [
      'SQL injection via DDL-breaking quote',
      'store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66afa6"; DROP SCHEMA public CASCADE;--',
    ],
    [
      'trailing semicolon',
      'store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66afa6;',
    ],
    [
      'embedded whitespace',
      'store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66afa 6',
    ],
    [
      'embedded double quote',
      'store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66af"6',
    ],
    [
      'embedded single quote',
      "store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66af'6",
    ],
    [
      // Postgres truncates identifiers at 63 bytes; a name this long either
      // silently collides after truncation or was never produced by
      // schemaNameFor — reject it rather than let it reach DDL.
      'overlong name past Postgres 63-byte identifier limit',
      'store_mgmt_tenant_3fa85f64_5717_4562_b3fc_2c963f66afa6_extra_padding_well_past_sixty_three_bytes',
    ],
  ])('rejects %s', (_label, name) => {
    expect(() => assertSchemaName(name)).toThrow(InvalidSchemaNameError);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error - deliberately passing a non-string at the boundary
    expect(() => assertSchemaName(undefined)).toThrow(InvalidSchemaNameError);
    // @ts-expect-error - deliberately passing a non-string at the boundary
    expect(() => assertSchemaName(null)).toThrow(InvalidSchemaNameError);
  });
});
