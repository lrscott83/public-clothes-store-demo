import type { UserRoleValue } from '../users/roles.js';
import type { CompanyUser, CreateCompanyUserInput } from './company-user.js';

/**
 * Port for reading/writing `CompanyUser` role assignments. Zero dependency
 * on any persistence technology — domain and application code import this
 * interface, never a concrete Prisma class.
 */
export interface ICompanyUserRepository {
  create(input: CreateCompanyUserInput): Promise<CompanyUser>;
  /** Sole ACTIVE assignment for `userId`, or `null`. `JwtStrategy` hot path (per cache miss) in the Phase 2 cutover. */
  findActiveByUserId(userId: string): Promise<CompanyUser | null>;
  findByUserAndCompany(userId: string, companyId: string): Promise<CompanyUser | null>;
  updateRole(userId: string, companyId: string, role: UserRoleValue): Promise<CompanyUser>;
  /** Batch source for `UsersService.list()` in the Phase 2 cutover — avoids N+1. */
  listByCompany(companyId: string): Promise<CompanyUser[]>;
}

/** DI token for `ICompanyUserRepository` — consumers inject by this symbol. */
export const COMPANY_USER_REPOSITORY = Symbol('ICompanyUserRepository');
