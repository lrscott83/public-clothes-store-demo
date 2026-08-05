import type { Company, CreateCompanyInput } from './company.js';

/**
 * Port for reading and provisioning `Company` rows. Zero dependency on any
 * persistence technology — domain and application code import this
 * interface, never a concrete Prisma class. `list()` is the input to
 * `resolveSoleCompany` at signup time. `create`/`setSchemaName`/`delete`
 * exist for the provisioning saga (design.md D7) — the ONLY writer of a
 * `Company` row; nothing else in this codebase creates or removes one.
 */
export interface ICompanyRepository {
  list(): Promise<Company[]>;
  findById(id: string): Promise<Company | null>;
  /** Provisioning saga step 1 — `schemaName` always starts NULL. */
  create(input: CreateCompanyInput): Promise<Company>;
  /** Provisioning saga step 3, and that step's own compensation (`schemaName: null`). */
  setSchemaName(id: string, schemaName: string | null): Promise<Company>;
  /** Provisioning saga step 1's compensation — undoes `create` when a later step fails. */
  delete(id: string): Promise<void>;
}

/** DI token for `ICompanyRepository` — consumers inject by this symbol. */
export const COMPANY_REPOSITORY = Symbol('ICompanyRepository');
