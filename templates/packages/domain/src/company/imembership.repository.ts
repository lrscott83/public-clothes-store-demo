import type { CreateMembershipInput, Membership } from './models.js';

/**
 * Port for reading/writing master-schema `Membership` rows. Zero
 * dependency on any persistence technology — domain and application code
 * import this interface, never a concrete Prisma class.
 */
export interface IMembershipRepository {
  create(input: CreateMembershipInput): Promise<Membership>;
  findByUserAndCompany(userId: string, companyId: string): Promise<Membership | null>;
  /** Sole ACTIVE Membership for `userId` — the `TenantContextGuard` fallback (D4) when no `X-Company-Id` header is sent. */
  findActiveByUserId(userId: string): Promise<Membership | null>;
  listByCompany(companyId: string): Promise<Membership[]>;
}

/** DI token for `IMembershipRepository` — consumers inject by this symbol. */
export const MEMBERSHIP_REPOSITORY = Symbol('IMembershipRepository');
