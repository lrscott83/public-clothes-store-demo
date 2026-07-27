import type { Company } from './company.js';

/**
 * Port for reading `Company` rows. Zero dependency on any persistence
 * technology — domain and application code import this interface, never a
 * concrete Prisma class. Deliberately has NO `create` — nothing in this
 * slice creates a `Company` through application code; the single row is
 * seeded by migration 001 + `infra-db/src/company/seed.ts`. `list()` is the
 * input to `resolveSoleCompany` at signup time.
 */
export interface ICompanyRepository {
  list(): Promise<Company[]>;
  findById(id: string): Promise<Company | null>;
}

/** DI token for `ICompanyRepository` — consumers inject by this symbol. */
export const COMPANY_REPOSITORY = Symbol('ICompanyRepository');
